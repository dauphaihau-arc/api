import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MikroORM } from '@mikro-orm/postgresql';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import request from 'supertest';
import type { Agent } from 'supertest';
import type { App } from 'supertest/types';
import { Client } from 'pg';
import type * as BootstrapAppModule from '~/bootstrap/app.module';
import { GlobalExceptionFilter } from '~/platform/filters/global-exception.filter';
import { validationExceptionFactory } from '~/platform/pipes/validation-exception.factory';
import { RequestLoggingInterceptor } from '~/platform/logging/request-logging.interceptor';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import { RequestContextService } from '~/platform/request-context/request-context.service';
import { ObservabilityService } from '~/platform/observability/observability.service';
import { PermissionEntity } from '~/domains/auth/infra/persistence/entities/permission.entity';
import { RolePermissionEntity } from '~/domains/auth/infra/persistence/entities/role-permission.entity';
import { RoleEntity } from '~/domains/auth/infra/persistence/entities/role.entity';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { LocalFileStorageService } from '~/integrations/storage/infra/local-file-storage.service';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import type {
  AppJobName,
  AppJobPayloadMap,
  DispatchJobOptions,
} from '~/platform/jobs/app-job.types';
import { createTestDatabase, dropTestDatabase } from '../support/test-postgres';
import type { TestDatabaseContext } from '../support/test-postgres';
import { seedAuthReferenceData } from '../../database/seeds/auth.seed';
import { resolveShopId } from '../support/shipping-fixtures';

jest.setTimeout(240_000);

const API_PREFIX = '/v1';
const VALID_TEST_PASSWORD = 'Password123!';
const CHANGE_INTERVAL_DAYS = 90;

type TestDatabase = TestDatabaseContext;
type TestSeller = {
  agent: Agent;
  email: string;
  userId: string;
  shopId: string;
  shopPublicId: string;
};

interface HistoryRow {
  id: string;
  currency: string;
  effective_from: Date;
  effective_to: Date | null;
  previous_currency: string | null;
  cutover_rate: string | null;
}

function restoreProcessEnv(originalEnv: NodeJS.ProcessEnv) {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

class NoopJobDispatcher extends JobDispatcher {
  async dispatch<TName extends AppJobName>(
    _name: TName,
    _payload: AppJobPayloadMap[TName],
    _options?: DispatchJobOptions,
  ): Promise<void> {}
}

// eslint-disable-next-line max-lines-per-function
describe('Shop Settlement Currency change (integration)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: TestDatabase;
  let storageRoot: string;
  let sql: Client;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase('finance_settlement_currency');
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-finance-settlement-'));

    process.env.NODE_ENV = 'test';
    process.env.DB_HOST = testDb.rootConfig.host;
    process.env.DB_PORT = String(testDb.rootConfig.port);
    process.env.DB_USER = testDb.rootConfig.user;
    process.env.DB_PASSWORD = testDb.rootConfig.password;
    process.env.DB_NAME = testDb.dbName;
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.JWT_ACCESS_TTL = '15m';
    process.env.JWT_REFRESH_TTL = '7d';
    process.env.BCRYPT_SALT_ROUNDS = '4';
    process.env.CACHE_DRIVER = 'memory';
    process.env.RATE_LIMIT_DRIVER = 'memory';
    process.env.RATE_LIMIT_LIMIT = '10000';
    process.env.QUEUE_DRIVER = 'inline';
    process.env.MAIL_DRIVER = 'logger';
    process.env.STORAGE_DRIVER = 'local';
    process.env.STORAGE_LOCAL_ROOT = storageRoot;
    process.env.FIELD_ENCRYPTION_KEY = '0123456789abcdef'.repeat(4);
    process.env.SETTLEMENT_CURRENCY_CHANGE_INTERVAL_DAYS = String(CHANGE_INTERVAL_DAYS);

    sql = new Client({
      host: testDb.rootConfig.host,
      port: testDb.rootConfig.port,
      user: testDb.rootConfig.user,
      password: testDb.rootConfig.password,
      database: testDb.dbName,
    });
    await sql.connect();

    const seedOrm = await MikroORM.init({
      ...buildDatabaseConfig(process.env, { debug: false }),
      entities: [RoleEntity, PermissionEntity, RolePermissionEntity],
    });
    try {
      await seedAuthReferenceData(seedOrm.em.fork());
    }
    finally {
      await seedOrm.close(true);
    }

    // AppModule must be loaded after the throwaway database env is applied.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('~/bootstrap/app.module') as typeof BootstrapAppModule;
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StorageService)
      .useValue(new LocalFileStorageService({ driver: 'local', localRoot: storageRoot }))
      .overrideProvider(JobDispatcher)
      .useValue(new NoopJobDispatcher())
      .compile();

    app = moduleFixture.createNestApplication();
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    app.enableShutdownHooks();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: validationExceptionFactory,
    }));
    const exceptionLogger = await app.resolve(PinoLogger);
    const requestLogger = await app.resolve(PinoLogger);
    app.useGlobalFilters(new GlobalExceptionFilter(app.get(RequestContextService), exceptionLogger));
    app.useGlobalInterceptors(
      new ClassSerializerInterceptor(app.get(Reflector)),
      new RequestLoggingInterceptor(
        app.get(RequestContextService),
        app.get(ObservabilityService),
        requestLogger,
      ),
    );
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
  });

  afterAll(async () => {
    if (sql) await sql.end();
    if (app) await app.close();
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
    restoreProcessEnv(originalEnv);
    if (testDb) await dropTestDatabase(testDb);
  });

  async function registerSeller(prefix: string, currency = 'USD'): Promise<TestSeller> {
    const agent = request.agent(app.getHttpServer());
    const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.com`;
    const registerResponse = await agent
      .post(`${API_PREFIX}/auth/register`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', `203.0.113.${Math.floor(Math.random() * 200) + 1}`)
      .send({ email, password: VALID_TEST_PASSWORD, displayName: 'Seller' })
      .expect(201);

    const sellerRole = await sql.query('select "id" from "roles" where "key" = \'seller\'');
    await sql.query(
      `insert into "user_roles" ("id", "created_at", "updated_at", "assigned_at", "user_id", "role_id")
       values ($1, now(), now(), now(), $2, $3)`,
      [randomUUID(), registerResponse.body.user.id, sellerRole.rows[0].id],
    );

    const shopResponse = await agent
      .post(`${API_PREFIX}/shops`)
      .set('Idempotency-Key', randomUUID())
      .send({
        shop_name: `set${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`,
        currency,
      })
      .expect(201);
    const shopPublicId = shopResponse.body.id as string;

    return {
      agent,
      email,
      userId: registerResponse.body.user.id as string,
      shopId: await resolveShopId(sql, shopPublicId),
      shopPublicId,
    };
  }

  function settlementUrl(seller: TestSeller): string {
    return `${API_PREFIX}/shops/${seller.shopPublicId}/finance/settlement-currency`;
  }

  function changeRequest(
    seller: TestSeller,
    currency: string,
    idempotencyKey = randomUUID(),
  ) {
    return seller.agent
      .post(settlementUrl(seller))
      .set('Idempotency-Key', idempotencyKey)
      .send({ currency });
  }

  async function seedExchangeRate(from: string, to: string, rate: string): Promise<void> {
    await sql.query(
      `insert into "exchange_rates" (
         "id", "created_at", "updated_at", "from_currency", "to_currency",
         "rate", "effective_at", "expires_at", "source"
       )
       values ($1, now(), now(), $2, $3, $4, now() - interval '1 minute', null, 'test')`,
      [randomUUID(), from, to, rate],
    );
  }

  async function seedPosition(
    shopId: string,
    currency: string,
    availableMinor: number,
    notYetAvailableMinor: number,
  ): Promise<void> {
    await sql.query(
      `insert into "seller_payable_positions" (
         "id", "created_at", "updated_at", "shop_id", "currency",
         "available_minor", "not_yet_available_minor"
       )
       values ($1, now(), now(), $2, $3, $4, $5)
       on conflict ("shop_id") do update
         set "currency" = excluded."currency",
             "available_minor" = excluded."available_minor",
             "not_yet_available_minor" = excluded."not_yet_available_minor",
             "updated_at" = now()`,
      [randomUUID(), shopId, currency, availableMinor, notYetAvailableMinor],
    );
  }

  async function seedActivePayoutAccount(
    shopId: string,
    currency: string,
  ): Promise<string> {
    const id = randomUUID();
    await sql.query(
      `insert into "payout_accounts" (
         "id", "created_at", "updated_at", "shop_id", "type", "provider",
         "provider_ref_encrypted", "holder_name", "bank_name", "country",
         "currency", "last4", "status", "verified_at", "deactivated_at"
       )
       values ($1, now(), now(), $2, 'bank', 'manual_bank', 'v1:test-ciphertext',
               'Jane Seller', 'Example Bank', 'US', $3, '6789', 'active', now(), null)`,
      [id, shopId, currency],
    );

    return id;
  }

  async function seedPendingPayout(shopId: string, currency: string): Promise<string> {
    const id = randomUUID();
    await sql.query(
      `insert into "payouts" (
         "id", "created_at", "updated_at", "public_id", "shop_id",
         "currency", "amount_minor", "state", "provider_reference",
         "attempt_count", "run_day", "paid_at"
       )
       values ($1, now(), now(), $2, $3, $4, 100, 'pending', null, 1,
               (now() at time zone 'utc')::date, null)`,
      [id, `pay_pending_${randomUUID().replace(/-/g, '').slice(0, 12)}`, shopId, currency],
    );

    return id;
  }

  async function readHistory(shopId: string): Promise<HistoryRow[]> {
    const result = await sql.query<HistoryRow>(
      `select "id", "currency", "effective_from", "effective_to",
              "previous_currency", "cutover_rate"
       from "settlement_currency_history"
       where "shop_id" = $1
       order by "effective_from" asc`,
      [shopId],
    );

    return result.rows;
  }

  async function readShopCurrency(shopId: string): Promise<string> {
    const result = await sql.query<{ currency: string }>(
      'select "currency" from "shops" where "id" = $1',
      [shopId],
    );

    return result.rows[0]!.currency;
  }

  async function readPayoutSettings(
    shopId: string,
  ): Promise<{ auto_payout_enabled: boolean } | undefined> {
    const result = await sql.query<{ auto_payout_enabled: boolean }>(
      'select "auto_payout_enabled" from "payout_settings" where "shop_id" = $1',
      [shopId],
    );

    return result.rows[0];
  }

  /**
   * One immutable Journal Entry and its Postings, recorded in `currency` before
   * the change. The test compares this row set before and after to prove the
   * change rewrites no recorded money.
   */
  async function seedRecordedMoney(
    shopId: string,
    currency: string,
    amountMinor: number,
  ): Promise<void> {
    const value = new Date(Date.now() - (60 * 60 * 1000));
    const ledgerAccountId = randomUUID();
    const entryId = randomUUID();

    await sql.query(
      `insert into "ledger_accounts" (
         "id", "created_at", "updated_at", "account_key", "kind", "currency", "shop_id"
       )
       values ($1, now(), now(), $2, 'seller_payable', $3, $4)`,
      [ledgerAccountId, `seller_payable:${currency}:${shopId}`, currency, shopId],
    );
    await sql.query(
      `insert into "journal_entries" (
         "id", "created_at", "updated_at", "money_event_key", "money_event_kind",
         "shop_id", "currency", "occurred_at"
       )
       values ($1, now(), now(), $2, 'order.paid', $3, $4, $5)`,
      [entryId, `order.paid:${entryId}`, shopId, currency, value],
    );
    await sql.query(
      `insert into "postings" (
         "id", "created_at", "updated_at", "journal_entry_id", "ledger_account_id", "amount_minor"
       )
       values ($1, now(), now(), $2, $3, $4)`,
      [randomUUID(), entryId, ledgerAccountId, amountMinor],
    );
  }

  async function readRecordedMoney(shopId: string) {
    const entries = await sql.query(
      'select * from "journal_entries" where "shop_id" = $1 order by "id" asc',
      [shopId],
    );
    const postings = await sql.query(
      `select p.* from "postings" p
       join "journal_entries" e on e."id" = p."journal_entry_id"
       where e."shop_id" = $1 order by p."id" asc`,
      [shopId],
    );

    return { entries: entries.rows, postings: postings.rows };
  }

  it('changes the currency at a zero balance and records one dated history row', async () => {
    const seller = await registerSeller('set-success');
    await seedExchangeRate('USD', 'EUR', '0.9200000000');
    await seedActivePayoutAccount(seller.shopId, 'USD');
    const recordedMoneyBefore = await readRecordedMoney(seller.shopId);
    expect(recordedMoneyBefore.entries).toHaveLength(0);

    await seedRecordedMoney(seller.shopId, 'USD', 2500);
    const moneyBefore = await readRecordedMoney(seller.shopId);

    await seller.agent
      .put(`${API_PREFIX}/shops/${seller.shopPublicId}/finance/payout-settings`)
      .set('Idempotency-Key', randomUUID())
      .send({ auto_payout_enabled: true })
      .expect(200);

    const opening = await seller.agent
      .get(settlementUrl(seller))
      .expect(200);
    expect(opening.body).toMatchObject({
      currency: 'USD',
      previous_currency: null,
      change_interval_days: CHANGE_INTERVAL_DAYS,
      next_change_allowed_at: null,
      auto_payout_enabled: true,
    });

    const idempotencyKey = randomUUID();
    const response = await changeRequest(seller, 'eur', idempotencyKey).expect(200);

    expect(response.body).toEqual({
      currency: 'EUR',
      previous_currency: 'USD',
      effective_from: expect.any(String),
      auto_payout_enabled: false,
    });
    expect(Number.isNaN(Date.parse(response.body.effective_from as string))).toBe(false);

    const changedAt = new Date(response.body.effective_from as string);
    expect(Math.abs(changedAt.getTime() - Date.now())).toBeLessThan(60_000);

    expect(await readShopCurrency(seller.shopId)).toBe('EUR');

    const history = await readHistory(seller.shopId);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      currency: 'USD',
      previous_currency: null,
      cutover_rate: null,
    });
    expect(history[0]!.effective_to).not.toBeNull();
    expect(new Date(history[0]!.effective_to!).getTime()).toBe(changedAt.getTime());
    expect(history[1]).toMatchObject({
      currency: 'EUR',
      previous_currency: 'USD',
      cutover_rate: '0.92',
    });
    expect(history[1]!.effective_to).toBeNull();
    expect(new Date(history[1]!.effective_from).getTime()).toBe(changedAt.getTime());

    expect(await readPayoutSettings(seller.shopId)).toMatchObject({
      auto_payout_enabled: false,
    });

    const account = await sql.query<{ deactivated_at: Date | null }>(
      'select "deactivated_at" from "payout_accounts" where "shop_id" = $1',
      [seller.shopId],
    );
    expect(account.rows[0]!.deactivated_at).not.toBeNull();
    expect(new Date(account.rows[0]!.deactivated_at!).getTime()).toBe(changedAt.getTime());

    // The old account is historical: the seller is prompted to record a new one.
    const payoutAccount = await seller.agent
      .get(`${API_PREFIX}/shops/${seller.shopPublicId}/finance/payout-account`)
      .expect(200);
    expect(payoutAccount.body).toEqual({ payout_account: null });

    // Payouts stay refused: the old account is closed and the balance is zero.
    const manualPayout = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/finance/payouts/manual`)
      .set('Idempotency-Key', randomUUID())
      .send({});
    expect(manualPayout.status).toBe(400);
    expect(manualPayout.body.code).toBe('NO_PAYABLE_AMOUNT');
    const payouts = await sql.query<{ count: number }>(
      'select count(*)::int as count from "payouts" where "shop_id" = $1',
      [seller.shopId],
    );
    expect(payouts.rows[0]!.count).toBe(0);

    // No recorded money was rewritten or re-denominated.
    expect(await readRecordedMoney(seller.shopId)).toEqual(moneyBefore);

    const audit = await sql.query<{
      actor_id: string | null;
      summary: Record<string, unknown>;
    }>(
      `select "actor_id", "summary" from "audit_logs"
       where "action" = 'finance.settlement_currency.changed' and "entity_id" = $1
       order by "created_at" asc`,
      [seller.shopId],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]!.actor_id).toBe(seller.userId);
    expect(audit.rows[0]!.summary).toMatchObject({
      shopId: seller.shopId,
      previousCurrency: 'USD',
      currency: 'EUR',
      effectiveFrom: changedAt.toISOString(),
      cutoverRate: '0.92',
      cutoverRateSource: 'test',
      autoPayoutEnabledBefore: true,
      autoPayoutEnabled: false,
      availableMinor: 0,
      notYetAvailableMinor: 0,
    });

    // A replay with the same key answers the same result and writes nothing.
    const replay = await changeRequest(seller, 'eur', idempotencyKey).expect(200);
    expect(replay.body).toEqual(response.body);
    expect(await readHistory(seller.shopId)).toHaveLength(2);
    expect((await readHistory(seller.shopId)).filter((row) => row.effective_to === null))
      .toHaveLength(1);

    const read = await seller.agent.get(settlementUrl(seller)).expect(200);
    expect(read.body).toMatchObject({
      currency: 'EUR',
      previous_currency: 'USD',
      effective_from: response.body.effective_from,
      change_interval_days: CHANGE_INTERVAL_DAYS,
      auto_payout_enabled: false,
    });
    const nextAllowed = new Date(read.body.next_change_allowed_at as string);
    expect(nextAllowed.getTime()).toBe(
      changedAt.getTime() + (CHANGE_INTERVAL_DAYS * 24 * 60 * 60 * 1000),
    );
  });

  it('refuses while the shop holds Seller Payable in any state', async () => {
    const seller = await registerSeller('set-balance');
    await seedExchangeRate('USD', 'EUR', '0.92');
    // Seeds the shop's opening history row, which every refusal must leave as is.
    await seller.agent.get(settlementUrl(seller)).expect(200);

    await seedPosition(seller.shopId, 'USD', 1200, 0);
    const available = await changeRequest(seller, 'EUR');
    expect(available.status).toBe(409);
    expect(available.body.code).toBe('SETTLEMENT_CURRENCY_BALANCE_NOT_ZERO');

    await seedPosition(seller.shopId, 'USD', 0, 900);
    const notYetAvailable = await changeRequest(seller, 'EUR');
    expect(notYetAvailable.status).toBe(409);
    expect(notYetAvailable.body.code).toBe('SETTLEMENT_CURRENCY_BALANCE_NOT_ZERO');

    await seedPosition(seller.shopId, 'USD', -500, 0);
    const negative = await changeRequest(seller, 'EUR');
    expect(negative.status).toBe(409);
    expect(negative.body.code).toBe('SETTLEMENT_CURRENCY_BALANCE_NOT_ZERO');

    expect(await readShopCurrency(seller.shopId)).toBe('USD');
    expect(await readHistory(seller.shopId)).toHaveLength(1);
    expect(await readHistory(seller.shopId).then((rows) => rows[0]!.currency)).toBe('USD');
  });

  it('reports a clear shop as able to change', async () => {
    const seller = await registerSeller('set-eligible');

    const read = await seller.agent.get(settlementUrl(seller)).expect(200);

    expect(read.body).toMatchObject({
      currency: 'USD',
      can_change: true,
      blocked_reason: null,
      available_minor: 0,
      not_yet_available_minor: 0,
      pending_payout: false,
      next_change_allowed_at: null,
    });
  });

  it('reports a non-zero Seller Payable as balance_not_zero, matching the POST refusal', async () => {
    const seller = await registerSeller('set-eligible-balance');
    await seller.agent.get(settlementUrl(seller)).expect(200);

    await seedPosition(seller.shopId, 'USD', 1250, 300);
    const positive = await seller.agent.get(settlementUrl(seller)).expect(200);
    expect(positive.body).toMatchObject({
      can_change: false,
      blocked_reason: 'balance_not_zero',
      available_minor: 1250,
      not_yet_available_minor: 300,
      pending_payout: false,
    });

    const positiveChange = await changeRequest(seller, 'EUR');
    expect(positiveChange.status).toBe(409);
    expect(positiveChange.body.code).toBe('SETTLEMENT_CURRENCY_BALANCE_NOT_ZERO');

    await seedPosition(seller.shopId, 'USD', -500, -200);
    const negative = await seller.agent.get(settlementUrl(seller)).expect(200);
    expect(negative.body).toMatchObject({
      can_change: false,
      blocked_reason: 'balance_not_zero',
      available_minor: -500,
      not_yet_available_minor: -200,
    });

    const negativeChange = await changeRequest(seller, 'EUR');
    expect(negativeChange.status).toBe(409);
    expect(negativeChange.body.code).toBe('SETTLEMENT_CURRENCY_BALANCE_NOT_ZERO');
  });

  it('reports a pending Payout as payout_pending, matching the POST refusal', async () => {
    const seller = await registerSeller('set-eligible-pending');
    await seller.agent.get(settlementUrl(seller)).expect(200);

    await seedPendingPayout(seller.shopId, 'USD');

    const read = await seller.agent.get(settlementUrl(seller)).expect(200);
    expect(read.body).toMatchObject({
      can_change: false,
      blocked_reason: 'payout_pending',
      available_minor: 0,
      not_yet_available_minor: 0,
      pending_payout: true,
    });

    const change = await changeRequest(seller, 'EUR');
    expect(change.status).toBe(409);
    expect(change.body.code).toBe('SETTLEMENT_CURRENCY_PAYOUT_PENDING');
  });

  it('reports a change inside the interval as change_too_soon, matching the POST refusal', async () => {
    const seller = await registerSeller('set-eligible-interval');
    await seedExchangeRate('USD', 'EUR', '0.92');
    await seedExchangeRate('EUR', 'GBP', '0.85');

    const first = await changeRequest(seller, 'EUR').expect(200);
    const changedAt = new Date(first.body.effective_from as string);

    const read = await seller.agent.get(settlementUrl(seller)).expect(200);
    expect(read.body).toMatchObject({
      can_change: false,
      blocked_reason: 'change_too_soon',
      available_minor: 0,
      not_yet_available_minor: 0,
      pending_payout: false,
    });
    expect(read.body.next_change_allowed_at).toEqual(expect.any(String));
    expect(new Date(read.body.next_change_allowed_at as string).getTime()).toBe(
      changedAt.getTime() + (CHANGE_INTERVAL_DAYS * 24 * 60 * 60 * 1000),
    );

    const change = await changeRequest(seller, 'GBP');
    expect(change.status).toBe(409);
    expect(change.body.code).toBe('SETTLEMENT_CURRENCY_CHANGE_TOO_SOON');
  });

  it('refuses while a Payout is pending and when no rate converts the currency', async () => {
    const seller = await registerSeller('set-pending');
    await seedExchangeRate('USD', 'EUR', '0.92');
    await seller.agent.get(settlementUrl(seller)).expect(200);

    const pendingPayoutId = await seedPendingPayout(seller.shopId, 'USD');
    const pending = await changeRequest(seller, 'EUR');
    expect(pending.status).toBe(409);
    expect(pending.body.code).toBe('SETTLEMENT_CURRENCY_PAYOUT_PENDING');

    await sql.query('delete from "payouts" where "id" = $1', [pendingPayoutId]);

    // GBP has no rate from USD in this database, so the change is refused
    // rather than recorded at a synthetic rate.
    const noRate = await changeRequest(seller, 'GBP');
    expect(noRate.status).toBe(503);
    expect(noRate.body.code).toBe('SETTLEMENT_CURRENCY_RATE_UNAVAILABLE');

    expect(await readShopCurrency(seller.shopId)).toBe('USD');
    expect(await readHistory(seller.shopId)).toHaveLength(1);
  });

  it('refuses an unchanged or unsupported currency and rate-limits the next change', async () => {
    const seller = await registerSeller('set-interval');
    await seedExchangeRate('USD', 'EUR', '0.92');
    await seedExchangeRate('EUR', 'GBP', '0.85');

    const same = await changeRequest(seller, 'USD');
    expect(same.status).toBe(400);
    expect(same.body.code).toBe('SETTLEMENT_CURRENCY_UNCHANGED');

    const unsupported = await changeRequest(seller, 'XXX');
    expect(unsupported.status).toBe(400);

    const missingKey = await seller.agent
      .post(settlementUrl(seller))
      .send({ currency: 'EUR' });
    expect(missingKey.status).toBe(409);

    const first = await changeRequest(seller, 'EUR').expect(200);
    expect(first.body.currency).toBe('EUR');

    const tooSoon = await changeRequest(seller, 'GBP');
    expect(tooSoon.status).toBe(409);
    expect(tooSoon.body.code).toBe('SETTLEMENT_CURRENCY_CHANGE_TOO_SOON');
    expect(tooSoon.body.message).toContain('less than 90 days');

    const history = await readHistory(seller.shopId);
    expect(history).toHaveLength(2);
    expect(history[1]).toMatchObject({ currency: 'EUR', previous_currency: 'USD' });
    expect(await readShopCurrency(seller.shopId)).toBe('EUR');
  });

  it('refuses another seller changing the shop', async () => {
    const owner = await registerSeller('set-owner');
    const stranger = await registerSeller('set-stranger');
    await seedExchangeRate('USD', 'EUR', '0.92');
    await owner.agent.get(settlementUrl(owner)).expect(200);

    const response = await stranger.agent
      .post(`${API_PREFIX}/shops/${owner.shopPublicId}/finance/settlement-currency`)
      .set('Idempotency-Key', randomUUID())
      .send({ currency: 'EUR' });
    expect(response.status).toBe(403);

    expect(await readHistory(owner.shopId)).toHaveLength(1);
    expect(await readHistory(owner.shopId).then((rows) => rows[0]!.currency)).toBe('USD');
    expect(await readShopCurrency(owner.shopId)).toBe('USD');
    expect(await readShopCurrency(stranger.shopId)).toBe('USD');
  });
});
