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
import {
  PayoutGateway,
  type PayoutProviderBalance,
  type PayoutTransferInput,
  type PayoutTransferResult,
} from '~/integrations/payment/app/ports/payout-gateway';
import { RetryPayoutJob } from '~/domains/finance/jobs/retry-payout.job';
import { PayShopUseCase } from '~/domains/finance/app/use-cases/pay-shop/pay-shop.use-case';
import { createTestDatabase, dropTestDatabase } from '../support/test-postgres';
import type { TestDatabaseContext } from '../support/test-postgres';
import { seedAuthReferenceData } from '../../database/seeds/auth.seed';
import { resolveShopId } from '../support/shipping-fixtures';

jest.setTimeout(240_000);

const API_PREFIX = '/v1';
const VALID_TEST_PASSWORD = 'Password123!';

type TestDatabase = TestDatabaseContext;
type TestSeller = {
  agent: Agent;
  email: string;
  userId: string;
  shopId: string;
  shopPublicId: string;
};

type PayoutRow = {
  id: string;
  public_id: string;
  currency: string;
  amount_minor: number;
  state: string;
  source_currency: string | null;
  target_currency: string | null;
  transfer_currency: string | null;
  transfer_amount_minor: string | null;
  fx_rate: string | null;
  provider_fx_rate: string | null;
  target_amount_minor: string | null;
  fx_fee_minor: string | null;
};

type PostingRow = { kind: string; amount_minor: number };

type JournalEntryRow = {
  money_event_key: string;
  money_event_kind: string;
  currency: string;
  shop_id: string | null;
  fx_rate: string | null;
  postings: PostingRow[];
};

function restoreProcessEnv(originalEnv: NodeJS.ProcessEnv) {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

type DispatchedJob = {
  name: AppJobName;
  payload: AppJobPayloadMap[AppJobName];
  options?: DispatchJobOptions;
};

class RecordingJobDispatcher extends JobDispatcher {
  readonly jobs: DispatchedJob[] = [];

  async dispatch<TName extends AppJobName>(
    name: TName,
    payload: AppJobPayloadMap[TName],
    options?: DispatchJobOptions,
  ): Promise<void> {
    this.jobs.push({ name, payload, options });
  }

  named(name: AppJobName): DispatchedJob[] {
    return this.jobs.filter(job => job.name === name);
  }
}

class FakePayoutGateway extends PayoutGateway {
  readonly calls: PayoutTransferInput[] = [];
  failuresRemaining = 0;

  /** What the fake provider reports as the applied conversion evidence. */
  providerFxRate: string | null = null;
  targetAmountMinor: number | null = null;

  /** The platform balance the pre-flight check reads; unlimited by default. */
  providerBalance: PayoutProviderBalance | null = {
    currency: 'USD',
    availableMinor: Number.MAX_SAFE_INTEGER,
    pendingMinor: 0,
  };

  balanceReads = 0;

  async retrieveBalance(currency: string): Promise<PayoutProviderBalance | null> {
    this.balanceReads += 1;

    return this.providerBalance ? { ...this.providerBalance, currency } : null;
  }

  async send(input: PayoutTransferInput): Promise<PayoutTransferResult> {
    this.calls.push(input);

    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error('provider declined the transfer');
    }

    return {
      reference: `transfer_${this.calls.length}`,
      providerFxRate: this.providerFxRate,
      targetAmountMinor: this.targetAmountMinor,
    };
  }
}

// eslint-disable-next-line max-lines-per-function
describe('Provider-sourced payout conversion (integration)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: TestDatabase;
  let storageRoot: string;
  let sql: Client;
  let payoutGateway: FakePayoutGateway;
  let jobDispatcher: RecordingJobDispatcher;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase('finance_provider_conversion');
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-provider-payout-int-'));
    payoutGateway = new FakePayoutGateway();
    jobDispatcher = new RecordingJobDispatcher();

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
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.RATE_LIMIT_DRIVER = 'memory';
    process.env.RATE_LIMIT_LIMIT = '10000';
    process.env.QUEUE_DRIVER = 'inline';
    process.env.MAIL_DRIVER = 'logger';
    process.env.STORAGE_DRIVER = 'local';
    process.env.STORAGE_LOCAL_ROOT = storageRoot;
    process.env.FIELD_ENCRYPTION_KEY = '0123456789abcdef'.repeat(4);
    process.env.PAYOUT_MANUAL_WITHDRAWAL_UNLIMITED = 'true';

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
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(new LocalFileStorageService({ driver: 'local', localRoot: storageRoot }))
      .overrideProvider(JobDispatcher)
      .useValue(jobDispatcher)
      .overrideProvider(PayoutGateway)
      .useValue(payoutGateway)
      .compile();

    app = moduleFixture.createNestApplication();
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    app.enableShutdownHooks();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    const exceptionLogger = await app.resolve(PinoLogger);
    const requestLogger = await app.resolve(PinoLogger);
    app.useGlobalFilters(
      new GlobalExceptionFilter(app.get(RequestContextService), exceptionLogger),
    );
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

  beforeEach(async () => {
    payoutGateway.calls.length = 0;
    payoutGateway.failuresRemaining = 0;
    payoutGateway.providerFxRate = null;
    payoutGateway.targetAmountMinor = null;
    payoutGateway.providerBalance = {
      currency: 'USD',
      availableMinor: Number.MAX_SAFE_INTEGER,
      pendingMinor: 0,
    };
    payoutGateway.balanceReads = 0;
    jobDispatcher.jobs.length = 0;
    // Rates are global, so each scenario seeds exactly the pair it expects.
    await sql.query('delete from "exchange_rates"');
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
        shop_name: `fx${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`,
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

  function financeUrl(seller: TestSeller, suffix: string): string {
    return `${API_PREFIX}/shops/${seller.shopPublicId}/finance/${suffix}`;
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

  async function seedPayable(
    shopId: string,
    currency: string,
    availableMinor: number,
  ): Promise<void> {
    await sql.query(
      `insert into "seller_payable_balances" (
         "id", "created_at", "updated_at", "shop_id", "currency",
         "available_balance_minor", "pending_balance_minor"
       )
       values ($1, now(), now(), $2, $3, $4, 0)
       on conflict ("shop_id") do update
         set "currency" = excluded."currency",
             "available_balance_minor" = excluded."available_balance_minor",
             "pending_balance_minor" = 0,
             "updated_at" = now()`,
      [randomUUID(), shopId, currency, availableMinor],
    );
  }

  /**
   * One undischarged Payout Availability row. No Order row is needed: the
   * availability table references only the shop, and the payout claim treats the
   * order id as the allocation key.
   */
  async function seedAvailability(
    shopId: string,
    amountMinor: number,
    currency = 'USD',
  ): Promise<string> {
    const orderId = randomUUID();
    await sql.query(
      `insert into "payout_availabilities" (
         "id", "created_at", "updated_at", "order_id", "shop_id", "currency",
         "amount_minor", "delivered_at", "evidence"
       )
       values ($1, now(), now(), $2, $3, $4, $5, now() - interval '1 hour', '{}'::jsonb)`,
      [randomUUID(), orderId, shopId, currency, amountMinor],
    );

    return orderId;
  }

  async function seedPayoutAccount(
    shopId: string,
    options: {
      currency?: string;
      country?: string;
      provider?: 'manual_bank' | 'stripe_connect';
      status?: string;
      payoutsEnabled?: boolean;
      transfersCapability?: string | null;
    } = {},
  ): Promise<string> {
    const {
      currency = 'USD',
      country = 'US',
      provider = 'manual_bank',
      status = 'active',
      payoutsEnabled = status === 'active',
      transfersCapability = status === 'active' ? 'active' : null,
    } = options;
    const id = randomUUID();
    await sql.query(
      `insert into "payout_accounts" (
         "id", "created_at", "updated_at", "shop_id", "provider",
         "provider_account_id", "country", "currency", "status",
         "payouts_enabled", "charges_enabled", "transfers_capability",
         "requirements", "default_currency", "deactivated_at"
       )
       values ($1, now(), now(), $2, $3, $4, $5, $6, $7::text,
               $8, $8, $9, null, $6, null)`,
      [
        id,
        shopId,
        provider,
        provider === 'stripe_connect' ? `acct_${id.slice(0, 16)}` : null,
        country,
        currency,
        status,
        payoutsEnabled,
        transfersCapability,
      ],
    );

    return id;
  }

  async function readPayouts(shopId: string): Promise<PayoutRow[]> {
    return (await sql.query(
      `select "id", "public_id", "currency", "amount_minor", "state",
              "source_currency", "target_currency", "transfer_currency",
              "transfer_amount_minor"::text as "transfer_amount_minor",
              "fx_rate", "provider_fx_rate",
              "target_amount_minor"::text as "target_amount_minor",
              "fx_fee_minor"::text as "fx_fee_minor"
       from "payouts" where "shop_id" = $1 order by "created_at" asc`,
      [shopId],
    )).rows as PayoutRow[];
  }

  async function readPostings(payoutId: string): Promise<PostingRow[]> {
    return (await sql.query(
      `select la."kind" as "kind", p."amount_minor" as "amount_minor"
       from "postings" p
       join "journal_entries" je on je."id" = p."journal_entry_id"
       join "ledger_accounts" la on la."id" = p."ledger_account_id"
       where je."money_event_key" = $1
       order by p."amount_minor" asc`,
      [`payout.paid:${payoutId}`],
    )).rows as PostingRow[];
  }

  /**
   * The Payout's shop-currency entry and, when its transfer left the platform
   * balance in another currency, its platform-currency entry.
   */
  async function readEntries(payoutId: string): Promise<JournalEntryRow[]> {
    return (await sql.query(
      `select je."money_event_key", je."money_event_kind", je."currency",
              je."shop_id", je."fx_rate",
              json_agg(
                json_build_object(
                  'kind', la."kind",
                  'amount_minor', p."amount_minor"
                )
                order by p."amount_minor" asc
              ) as "postings"
       from "journal_entries" je
       join "postings" p on p."journal_entry_id" = je."id"
       join "ledger_accounts" la on la."id" = p."ledger_account_id"
       where je."money_event_key" in ($1, $2)
       group by je."id"
       order by je."money_event_key" asc`,
      [`payout.paid:${payoutId}`, `payout.fx:${payoutId}`],
    )).rows as JournalEntryRow[];
  }

  async function readAvailableMinor(shopId: string): Promise<number | undefined> {
    const rows = (await sql.query(
      'select "available_balance_minor" from "seller_payable_balances" where "shop_id" = $1',
      [shopId],
    )).rows as Array<{ available_balance_minor: number }>;

    return rows[0]?.available_balance_minor;
  }

  function requestManualPayout(seller: TestSeller, amountMinor: number) {
    return seller.agent
      .post(financeUrl(seller, 'payouts/manual'))
      .set('Idempotency-Key', randomUUID())
      .send({ amount_minor: amountMinor });
  }

  it('serves no payout currency options endpoint any more', async () => {
    const seller = await registerSeller('fx-no-options');

    await seller.agent
      .get(financeUrl(seller, 'payout-account/currencies'))
      .query({ country: 'US' })
      .expect(404);
  });

  it('lets auto payout opt in with a foreign account currency when capabilities are active', async () => {
    const eligible = await registerSeller('fx-eligible-connected');
    await seedPayoutAccount(eligible.shopId, {
      provider: 'stripe_connect',
      currency: 'VND',
    });

    await eligible.agent
      .put(financeUrl(eligible, 'payout-settings'))
      .set('Idempotency-Key', randomUUID())
      .send({ auto_payout_enabled: true })
      .expect(200);

    // A stale capability flag still blocks: the run may not send money to an
    // account Stripe has not granted.
    const inactive = await registerSeller('fx-eligible-inactive');
    await seedPayoutAccount(inactive.shopId, {
      provider: 'stripe_connect',
      currency: 'VND',
      payoutsEnabled: false,
    });

    const refused = await inactive.agent
      .put(financeUrl(inactive, 'payout-settings'))
      .set('Idempotency-Key', randomUUID())
      .send({ auto_payout_enabled: true })
      .expect(409);

    expect(refused.body).toMatchObject({
      code: 'AUTO_PAYOUT_NOT_ELIGIBLE',
      message: expect.stringContaining('payout_account_unverified'),
    });

    // Outstanding requirements block the same way.
    const pending = await registerSeller('fx-eligible-requirements');
    await seedPayoutAccount(pending.shopId, {
      provider: 'stripe_connect',
      currency: 'VND',
      status: 'action_required',
    });

    const requirementsDue = await pending.agent
      .put(financeUrl(pending, 'payout-settings'))
      .set('Idempotency-Key', randomUUID())
      .send({ auto_payout_enabled: true })
      .expect(409);

    expect(requirementsDue.body).toMatchObject({
      code: 'AUTO_PAYOUT_NOT_ELIGIBLE',
      message: expect.stringContaining('payout_account_unverified'),
    });
  });

  it('estimates with no fee, then records Stripe’s rate and destination amount', async () => {
    const seller = await registerSeller('fx-quote-pay');
    await seedExchangeRate('USD', 'VND', '25000');
    await seedPayoutAccount(seller.shopId, {
      provider: 'stripe_connect',
      currency: 'VND',
    });
    await seedPayable(seller.shopId, 'USD', 12_500);
    await seedAvailability(seller.shopId, 12_500);

    // The estimate converts the whole 125.00 USD at 25,000 VND per USD, a
    // zero-decimal currency. No platform fee is deducted.
    const quote = await seller.agent
      .get(financeUrl(seller, 'payouts/quote'))
      .query({ amount_minor: 12_500 })
      .expect(200);

    expect(quote.body).toEqual({
      source_currency: 'USD',
      target_currency: 'VND',
      source_amount_minor: 12_500,
      fx_rate: expect.stringMatching(/^25000/),
      target_amount_minor: 3_125_000,
      estimated: true,
    });
    expect(quote.body).not.toHaveProperty('fx_fee_minor');

    // Stripe applies a slightly different rate than the display estimate.
    payoutGateway.providerFxRate = '25010';
    payoutGateway.targetAmountMinor = 312_625_000;

    const paid = await requestManualPayout(seller, 12_500).expect(200);

    expect(paid.body.payout).toMatchObject({
      amount_minor: 12_500,
      currency: 'USD',
      source_currency: 'USD',
      target_currency: 'VND',
      // The shop already settles in the platform currency, so the transfer is
      // the identity; Stripe's values are what landed in the account.
      transfer_currency: 'USD',
      transfer_amount_minor: 12_500,
      fx_rate: '1',
      provider_fx_rate: '25010',
      target_amount_minor: 312_625_000,
      fx_fee_minor: 0,
      state: 'paid',
    });

    const payouts = await readPayouts(seller.shopId);
    expect(payouts).toHaveLength(1);
    expect(payouts[0]).toMatchObject({
      currency: 'USD',
      amount_minor: 12_500,
      source_currency: 'USD',
      target_currency: 'VND',
      transfer_currency: 'USD',
      transfer_amount_minor: '12500',
      fx_rate: '1',
      provider_fx_rate: '25010',
      fx_fee_minor: '0',
      target_amount_minor: '312625000',
      state: 'paid',
    });

    // The transfer is denominated in the platform currency; the provider
    // converts from there into the account currency.
    expect(payoutGateway.calls).toHaveLength(1);
    expect(payoutGateway.calls[0]).toMatchObject({
      currency: 'USD',
      amountMinor: 12_500,
      transferCurrency: 'USD',
      transferAmountMinor: 12_500,
      targetCurrency: 'VND',
    });

    // The ledger and Seller Payable stay in the shop currency.
    expect(await readPostings(payouts[0]!.id)).toEqual([
      { kind: 'seller_payable', amount_minor: -12_500 },
      { kind: 'platform_clearing', amount_minor: 12_500 },
    ]);
    // A same-currency transfer stays in the platform balance it started in, so
    // the platform-currency leg has nothing to record.
    expect((await readEntries(payouts[0]!.id)).map(entry => entry.money_event_kind))
      .toEqual(['payout.paid']);
    expect(await readAvailableMinor(seller.shopId)).toBe(0);

    const history = await seller.agent
      .get(financeUrl(seller, 'payouts'))
      .expect(200);
    expect(history.body.payouts[0]).toMatchObject({
      source_currency: 'USD',
      target_currency: 'VND',
      transfer_currency: 'USD',
      transfer_amount_minor: 12_500,
      provider_fx_rate: '25010',
      target_amount_minor: 312_625_000,
    });
  });

  it('records no provider conversion evidence for a manual transfer', async () => {
    const seller = await registerSeller('fx-manual-nulls');
    await seedPayoutAccount(seller.shopId, { currency: 'VND' });
    await seedPayable(seller.shopId, 'USD', 12_500);
    await seedAvailability(seller.shopId, 12_500);

    const paid = await requestManualPayout(seller, 12_500).expect(200);

    expect(paid.body.payout).toMatchObject({
      source_currency: 'USD',
      target_currency: 'VND',
      transfer_currency: 'USD',
      transfer_amount_minor: 12_500,
      fx_rate: '1',
      provider_fx_rate: null,
      target_amount_minor: null,
      fx_fee_minor: 0,
      state: 'paid',
    });

    const payouts = await readPayouts(seller.shopId);
    expect(payouts[0]).toMatchObject({
      transfer_currency: 'USD',
      transfer_amount_minor: '12500',
      fx_rate: '1',
      provider_fx_rate: null,
      target_amount_minor: null,
      fx_fee_minor: '0',
    });
    expect(await readAvailableMinor(seller.shopId)).toBe(0);
  });

  it('refuses to claim when no rate converts the shop currency into the platform currency', async () => {
    const seller = await registerSeller('fx-no-rate', 'CAD');
    await seedPayoutAccount(seller.shopId, { currency: 'VND' });
    await seedPayable(seller.shopId, 'CAD', 12_500);
    await seedAvailability(seller.shopId, 12_500, 'CAD');

    // With no rates at all, the display estimate into the account currency
    // cannot be computed...
    const quote = await seller.agent
      .get(financeUrl(seller, 'payouts/quote'))
      .query({ amount_minor: 12_500 })
      .expect(503);

    expect(quote.body).toMatchObject({
      code: 'PAYOUT_CONVERSION_RATE_UNAVAILABLE',
    });

    // ...and so does the claim, which converts into the platform's USD balance.
    const refused = await requestManualPayout(seller, 12_500).expect(503);
    expect(refused.body).toMatchObject({
      code: 'PAYOUT_CONVERSION_RATE_UNAVAILABLE',
    });

    expect(await readPayouts(seller.shopId)).toHaveLength(0);
    expect(payoutGateway.calls).toHaveLength(0);
    expect(payoutGateway.balanceReads).toBe(0);
    expect(jobDispatcher.named('payout.retry')).toHaveLength(0);
  });

  it('converts a CAD payout into the platform USD balance and keeps the ledger in CAD', async () => {
    const seller = await registerSeller('fx-cad-pay', 'CAD');
    await seedExchangeRate('CAD', 'USD', '0.73');
    await seedPayoutAccount(seller.shopId, {
      provider: 'stripe_connect',
      currency: 'CAD',
    });
    await seedPayable(seller.shopId, 'CAD', 10_000);
    await seedAvailability(seller.shopId, 10_000, 'CAD');

    payoutGateway.providerFxRate = '1';
    payoutGateway.targetAmountMinor = 7_300;

    const paid = await requestManualPayout(seller, 10_000).expect(200);

    // 100.00 CAD at 0.73 is 73.00 USD: the transfer leaves the platform's USD
    // balance, while the ledger still discharges the CAD amount.
    expect(paid.body.payout).toMatchObject({
      amount_minor: 10_000,
      currency: 'CAD',
      source_currency: 'CAD',
      target_currency: 'CAD',
      transfer_currency: 'USD',
      transfer_amount_minor: 7_300,
      fx_rate: expect.stringMatching(/^0\.73/),
      provider_fx_rate: '1',
      target_amount_minor: 7_300,
      fx_fee_minor: 0,
      state: 'paid',
    });

    const payouts = await readPayouts(seller.shopId);
    expect(payouts[0]).toMatchObject({
      currency: 'CAD',
      amount_minor: 10_000,
      transfer_currency: 'USD',
      transfer_amount_minor: '7300',
      state: 'paid',
    });

    expect(payoutGateway.calls).toHaveLength(1);
    expect(payoutGateway.calls[0]).toMatchObject({
      currency: 'CAD',
      amountMinor: 10_000,
      transferCurrency: 'USD',
      transferAmountMinor: 7_300,
      targetCurrency: 'CAD',
    });

    // The ledger and Seller Payable stay in CAD.
    expect(await readPostings(payouts[0]!.id)).toEqual([
      { kind: 'seller_payable', amount_minor: -10_000 },
      { kind: 'platform_clearing', amount_minor: 10_000 },
    ]);

    // The platform balance moved 73.00 USD, so the platform-currency leg is a
    // second, platform-level entry that balances in USD on its own.
    expect(await readEntries(payouts[0]!.id)).toEqual([
      {
        money_event_key: `payout.fx:${payouts[0]!.id}`,
        money_event_kind: 'payout.fx',
        currency: 'USD',
        shop_id: null,
        fx_rate: expect.stringMatching(/^0\.73/),
        postings: [
          { kind: 'platform_clearing', amount_minor: -7_300 },
          { kind: 'fx_position', amount_minor: 7_300 },
        ],
      },
      {
        money_event_key: `payout.paid:${payouts[0]!.id}`,
        money_event_kind: 'payout.paid',
        currency: 'CAD',
        shop_id: seller.shopId,
        fx_rate: null,
        postings: [
          { kind: 'seller_payable', amount_minor: -10_000 },
          { kind: 'platform_clearing', amount_minor: 10_000 },
        ],
      },
    ]);
    expect(await readAvailableMinor(seller.shopId)).toBe(0);
  });

  it('blocks a manual payout before any transfer when the platform holds no USD balance', async () => {
    const seller = await registerSeller('fx-unfunded', 'CAD');
    await seedExchangeRate('CAD', 'USD', '0.73');
    await seedPayoutAccount(seller.shopId, { currency: 'CAD' });
    await seedPayable(seller.shopId, 'CAD', 10_000);
    await seedAvailability(seller.shopId, 10_000, 'CAD');

    payoutGateway.providerBalance = null;

    const refused = await requestManualPayout(seller, 10_000).expect(409);

    expect(refused.body).toMatchObject({
      code: 'PROVIDER_BALANCE_PENDING',
      message: expect.stringContaining('USD'),
    });
    // Nothing was claimed, nothing transferred, and nothing is retried: the
    // balance is not going to change in minutes.
    expect(await readPayouts(seller.shopId)).toHaveLength(0);
    expect(payoutGateway.calls).toHaveLength(0);
    expect(jobDispatcher.named('payout.retry')).toHaveLength(0);
    expect(await readAvailableMinor(seller.shopId)).toBe(10_000);
  });

  it('skips a scheduled payout, without claiming or retrying, while the provider settles', async () => {
    const seller = await registerSeller('fx-scheduled-settling', 'CAD');
    await seedExchangeRate('CAD', 'USD', '0.73');
    await seedPayoutAccount(seller.shopId, { currency: 'CAD' });
    await seedPayable(seller.shopId, 'CAD', 10_000);
    await seedAvailability(seller.shopId, 10_000, 'CAD');

    payoutGateway.providerBalance = {
      currency: 'USD',
      availableMinor: 1_000,
      pendingMinor: 9_000,
    };

    // The scheduled run never throws for a shop; it skips and moves on.
    const result = await app.get(PayShopUseCase).execute({
      shopId: seller.shopId,
      currency: 'CAD',
      runDay: '2026-10-25',
      source: 'scheduled',
      periodKey: '2026-10',
      quotaConsumed: true,
    });

    expect(result).toEqual({ outcome: 'skipped', payout: null });
    expect(await readPayouts(seller.shopId)).toHaveLength(0);
    expect(payoutGateway.calls).toHaveLength(0);
    // Nothing was claimed, so there is nothing to retry in minutes.
    expect(jobDispatcher.named('payout.retry')).toHaveLength(0);
    expect(await readAvailableMinor(seller.shopId)).toBe(10_000);
  });

  it('blocks a manual payout while the provider is still settling its USD balance', async () => {
    const seller = await registerSeller('fx-settling', 'CAD');
    await seedExchangeRate('CAD', 'USD', '0.73');
    await seedPayoutAccount(seller.shopId, { currency: 'CAD' });
    await seedPayable(seller.shopId, 'CAD', 10_000);
    await seedAvailability(seller.shopId, 10_000, 'CAD');

    payoutGateway.providerBalance = {
      currency: 'USD',
      availableMinor: 1_000,
      pendingMinor: 9_000,
    };

    const refused = await requestManualPayout(seller, 10_000).expect(409);

    expect(refused.body).toMatchObject({
      code: 'PROVIDER_BALANCE_PENDING',
      message: 'Your payout provider is still settling funds; try again later.',
    });
    expect(await readPayouts(seller.shopId)).toHaveLength(0);
    expect(payoutGateway.calls).toHaveLength(0);
    expect(jobDispatcher.named('payout.retry')).toHaveLength(0);
  });

  it('settles a retry with the provider evidence and still keeps the ledger in the shop currency', async () => {
    const seller = await registerSeller('fx-retry');
    await seedExchangeRate('USD', 'VND', '25000');
    await seedPayoutAccount(seller.shopId, {
      provider: 'stripe_connect',
      currency: 'VND',
    });
    await seedPayable(seller.shopId, 'USD', 12_500);
    await seedAvailability(seller.shopId, 12_500);

    payoutGateway.failuresRemaining = 1;
    payoutGateway.providerFxRate = '25010';
    payoutGateway.targetAmountMinor = 312_625_000;

    const first = await requestManualPayout(seller, 12_500).expect(200);
    expect(first.body.payout.state).toBe('pending');

    const pending = await readPayouts(seller.shopId);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      state: 'pending',
      target_currency: 'VND',
      transfer_currency: 'USD',
      transfer_amount_minor: '12500',
      fx_rate: '1',
      provider_fx_rate: null,
      target_amount_minor: null,
      fx_fee_minor: '0',
    });
    expect(jobDispatcher.named('payout.retry')).toHaveLength(1);

    await app.get(RetryPayoutJob).run({ payoutId: pending[0]!.id });

    const retried = await readPayouts(seller.shopId);
    expect(retried[0]).toMatchObject({
      state: 'paid',
      transfer_currency: 'USD',
      transfer_amount_minor: '12500',
      fx_rate: '1',
      provider_fx_rate: '25010',
      target_amount_minor: '312625000',
      fx_fee_minor: '0',
    });

    expect(payoutGateway.calls).toHaveLength(2);
    expect(payoutGateway.calls[1]).toMatchObject({
      currency: 'USD',
      amountMinor: 12_500,
      transferCurrency: 'USD',
      transferAmountMinor: 12_500,
      targetCurrency: 'VND',
    });

    // Exactly one discharge, in the shop currency, on the eventual success.
    expect(await readPostings(retried[0]!.id)).toEqual([
      { kind: 'seller_payable', amount_minor: -12_500 },
      { kind: 'platform_clearing', amount_minor: 12_500 },
    ]);
    expect(await readAvailableMinor(seller.shopId)).toBe(0);
  });

  it('books the platform-currency leg once when a converted payout is retried and replayed', async () => {
    const seller = await registerSeller('fx-retry-converted', 'CAD');
    await seedExchangeRate('CAD', 'USD', '0.73');
    await seedPayoutAccount(seller.shopId, { currency: 'CAD' });
    await seedPayable(seller.shopId, 'CAD', 10_000);
    await seedAvailability(seller.shopId, 10_000, 'CAD');

    payoutGateway.failuresRemaining = 1;

    const first = await requestManualPayout(seller, 10_000).expect(200);
    expect(first.body.payout.state).toBe('pending');
    expect(jobDispatcher.named('payout.retry')).toHaveLength(1);

    const pending = await readPayouts(seller.shopId);
    expect(pending).toHaveLength(1);

    await app.get(RetryPayoutJob).run({ payoutId: pending[0]!.id });

    const entries = await readEntries(pending[0]!.id);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      money_event_key: `payout.fx:${pending[0]!.id}`,
      money_event_kind: 'payout.fx',
      currency: 'USD',
      shop_id: null,
      postings: [
        { kind: 'platform_clearing', amount_minor: -7_300 },
        { kind: 'fx_position', amount_minor: 7_300 },
      ],
    });
    expect(entries[1]).toMatchObject({
      money_event_key: `payout.paid:${pending[0]!.id}`,
      currency: 'CAD',
      shop_id: seller.shopId,
    });

    // A replayed retry finds the Payout already `paid` and writes nothing: the
    // platform-currency entry keeps its one key rather than booking again.
    await app.get(RetryPayoutJob).run({ payoutId: pending[0]!.id });

    expect(await readEntries(pending[0]!.id)).toHaveLength(2);
    expect(payoutGateway.calls).toHaveLength(2);
    expect(await readAvailableMinor(seller.shopId)).toBe(0);
  });
});
