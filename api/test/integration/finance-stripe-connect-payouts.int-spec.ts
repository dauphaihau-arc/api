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
import type Stripe from 'stripe';
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
import { PayoutGateway } from '~/integrations/payment/app/ports/payout-gateway';
import {
  StripeConnectPayoutGateway,
  type StripeConnectPayoutClient,
} from '~/integrations/payment/infra/stripe-connect-payout.gateway';
import { RetryPayoutJob } from '~/domains/finance/jobs/retry-payout.job';
import { createTestDatabase, dropTestDatabase } from '../support/test-postgres';
import type { TestDatabaseContext } from '../support/test-postgres';
import { seedAuthReferenceData } from '../../database/seeds/auth.seed';
import { resolveShopId } from '../support/shipping-fixtures';

jest.setTimeout(240_000);

const API_PREFIX = '/v1';
const VALID_TEST_PASSWORD = 'Password123!';
const PAYOUT_AMOUNT_MINOR = 12_500;

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
  state: string;
  currency: string;
  amount_minor: number;
  provider_reference: string | null;
};

type PostingRow = { kind: string; amount_minor: number };

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

interface RecordedTransfer {
  params: Stripe.TransferCreateParams;
  options?: Stripe.RequestOptions;
}

/**
 * The Stripe client double: records what the adapter asked for and can fail the
 * first call, so the retry path proves it reuses the Payout public id.
 */
class FakeStripeTransfersClient implements StripeConnectPayoutClient {
  readonly calls: RecordedTransfer[] = [];
  failuresRemaining = 0;
  /** When true, the failure is a Stripe 4xx the provider will keep refusing. */
  permanentFailure = false;

  /** The platform balance `balance.retrieve()` answers with: funded in USD. */
  balanceSnapshot = {
    available: [{ amount: 10_000_000, currency: 'usd' }],
    pending: [] as Array<{ amount: number; currency: string }>,
  };

  readonly balance = {
    retrieve: async () => this.balanceSnapshot,
  };

  readonly transfers = {
    create: async (
      params: Stripe.TransferCreateParams,
      options?: Stripe.RequestOptions,
    ): Promise<Stripe.Transfer> => {
      this.calls.push({ params, options });

      if (this.failuresRemaining > 0) {
        this.failuresRemaining -= 1;

        if (this.permanentFailure) {
          throw Object.assign(
            new Error('Your balance is insufficient to cover the requested transfer.'),
            { type: 'StripeInvalidRequestError', statusCode: 400, code: 'balance_insufficient' },
          );
        }

        throw new Error('stripe transfer unavailable');
      }

      return {
        id: `tr_int_${this.nextTransfer++}`,
        object: 'transfer',
      } as Stripe.Transfer;
    },
  };

  private nextTransfer = 1;

  reset(): void {
    this.calls.length = 0;
    this.failuresRemaining = 0;
    this.permanentFailure = false;
    this.balanceSnapshot = {
      available: [{ amount: 10_000_000, currency: 'usd' }],
      pending: [],
    };
    this.nextTransfer = 1;
  }
}

describe('Stripe Connect payout transfers (integration)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: TestDatabase;
  let storageRoot: string;
  let sql: Client;
  let stripeClient: FakeStripeTransfersClient;
  let jobDispatcher: RecordingJobDispatcher;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase('finance_stripe_connect_payouts');
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-stripe-payout-int-'));
    stripeClient = new FakeStripeTransfersClient();
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
    process.env.PAYOUT_MANUAL_WITHDRAWAL_UNLIMITED = 'true';
    process.env.PAYOUT_PROVIDER = 'stripe_connect';

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
      // The real adapter, with the Stripe client replaced by a double: the
      // payload, idempotency key and reference all come from production code.
      .overrideProvider(PayoutGateway)
      .useValue(
        new StripeConnectPayoutGateway(
          { stripeSecretKey: 'sk_test_integration' },
          stripeClient,
        ),
      )
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

  beforeEach(() => {
    stripeClient.reset();
    jobDispatcher.jobs.length = 0;
  });

  afterAll(async () => {
    if (sql) await sql.end();
    if (app) await app.close();
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
    restoreProcessEnv(originalEnv);
    if (testDb) await dropTestDatabase(testDb);
  });

  async function registerSeller(prefix: string): Promise<TestSeller> {
    const agent = request.agent(app.getHttpServer());
    const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.com`;
    const registerResponse = await agent
      .post(`${API_PREFIX}/auth/register`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', `198.51.100.${Math.floor(Math.random() * 200) + 1}`)
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
        shop_name: `con${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`,
        currency: 'USD',
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

  async function seedPayable(shopId: string, availableMinor: number): Promise<void> {
    await sql.query(
      `insert into "seller_payable_balances" (
         "id", "created_at", "updated_at", "shop_id", "currency",
         "available_balance_minor", "pending_balance_minor"
       )
       values ($1, now(), now(), $2, 'USD', $3, 0)`,
      [randomUUID(), shopId, availableMinor],
    );
  }

  async function seedAvailability(shopId: string, amountMinor: number): Promise<void> {
    await sql.query(
      `insert into "payout_availabilities" (
         "id", "created_at", "updated_at", "order_id", "shop_id", "currency",
         "amount_minor", "delivered_at", "evidence"
       )
       values ($1, now(), now(), $2, $3, 'USD', $4, now() - interval '1 hour', '{}'::jsonb)`,
      [randomUUID(), randomUUID(), shopId, amountMinor],
    );
  }

  async function seedConnectedPayoutAccount(shopId: string): Promise<string> {
    const id = randomUUID();
    // One connected account per shop: the column is unique across accounts.
    const providerAccountId = `acct_test_${id.replace(/-/g, '')}`;
    await sql.query(
      `insert into "payout_accounts" (
         "id", "created_at", "updated_at", "shop_id", "provider",
         "provider_account_id", "country", "currency", "status",
         "payouts_enabled", "charges_enabled", "transfers_capability",
         "requirements", "default_currency", "deactivated_at"
       )
       values ($1, now(), now(), $2, 'stripe_connect', $3, 'US', 'USD', 'active',
               true, true, 'active', null, 'USD', null)`,
      [id, shopId, providerAccountId],
    );

    return providerAccountId;
  }

  async function readPayouts(shopId: string): Promise<PayoutRow[]> {
    return (await sql.query(
      `select "id", "public_id", "state", "currency", "amount_minor",
              "provider_reference"
       from "payouts" where "shop_id" = $1 order by "created_at" asc`,
      [shopId],
    )).rows as PayoutRow[];
  }

  async function readJournalEntryCount(payoutId: string): Promise<number> {
    const rows = (await sql.query(
      `select count(*)::int as "count" from "journal_entries"
       where "money_event_key" = $1`,
      [`payout.paid:${payoutId}`],
    )).rows as Array<{ count: number }>;

    return rows[0]!.count;
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

  async function readPayoutNotifications(
    userId: string,
  ): Promise<Array<{ type: string; body: string }>> {
    return (await sql.query(
      `select "type", "body" from "notifications"
       where "user_id" = $1 and "type" like 'seller.payout.%'
       order by "created_at" asc`,
      [userId],
    )).rows as Array<{ type: string; body: string }>;
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

  async function seedPayableShop(
    prefix: string,
  ): Promise<{ seller: TestSeller; providerAccountId: string }> {
    const seller = await registerSeller(prefix);
    const providerAccountId = await seedConnectedPayoutAccount(seller.shopId);
    await seedPayable(seller.shopId, PAYOUT_AMOUNT_MINOR);
    await seedAvailability(seller.shopId, PAYOUT_AMOUNT_MINOR);

    return { seller, providerAccountId };
  }

  it('pays a Payout as one Stripe transfer and settles it once', async () => {
    const { seller, providerAccountId } = await seedPayableShop('connect-transfer');

    const paid = await requestManualPayout(seller, PAYOUT_AMOUNT_MINOR).expect(200);

    expect(paid.body.payout).toMatchObject({
      amount_minor: PAYOUT_AMOUNT_MINOR,
      currency: 'USD',
      state: 'paid',
    });

    const payouts = await readPayouts(seller.shopId);
    expect(payouts).toHaveLength(1);
    expect(payouts[0]).toMatchObject({
      state: 'paid',
      currency: 'USD',
      amount_minor: PAYOUT_AMOUNT_MINOR,
      provider_reference: 'tr_int_1',
    });

    expect(stripeClient.calls).toHaveLength(1);
    expect(stripeClient.calls[0]!.params).toEqual({
      amount: PAYOUT_AMOUNT_MINOR,
      currency: 'usd',
      destination: providerAccountId,
      metadata: { payout_public_id: payouts[0]!.public_id },
    });
    expect(stripeClient.calls[0]!.options).toEqual({
      idempotencyKey: payouts[0]!.public_id,
    });

    // The ledger is the same as the manual bank path: one Journal Entry that
    // discharges Seller Payable, in the shop currency.
    expect(await readJournalEntryCount(payouts[0]!.id)).toBe(1);
    expect(await readPostings(payouts[0]!.id)).toEqual([
      { kind: 'seller_payable', amount_minor: -PAYOUT_AMOUNT_MINOR },
      { kind: 'platform_clearing', amount_minor: PAYOUT_AMOUNT_MINOR },
    ]);
    expect(await readAvailableMinor(seller.shopId)).toBe(0);
  });

  it('retries with the same idempotency key and still settles exactly once', async () => {
    const { seller, providerAccountId } = await seedPayableShop('connect-retry');
    stripeClient.failuresRemaining = 1;

    const first = await requestManualPayout(seller, PAYOUT_AMOUNT_MINOR).expect(200);
    expect(first.body.payout.state).toBe('pending');

    const pending = await readPayouts(seller.shopId);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      state: 'pending',
      provider_reference: null,
    });
    expect(jobDispatcher.named('payout.retry')).toHaveLength(1);

    await app.get(RetryPayoutJob).run({ payoutId: pending[0]!.id });

    const paid = await readPayouts(seller.shopId);
    expect(paid[0]).toMatchObject({
      state: 'paid',
      provider_reference: 'tr_int_1',
    });

    expect(stripeClient.calls).toHaveLength(2);
    expect(stripeClient.calls.map(call => call.options?.idempotencyKey)).toEqual([
      paid[0]!.public_id,
      paid[0]!.public_id,
    ]);
    expect(stripeClient.calls.every(call => call.params.destination === providerAccountId))
      .toBe(true);

    expect(await readJournalEntryCount(paid[0]!.id)).toBe(1);
    expect(await readAvailableMinor(seller.shopId)).toBe(0);
  });

  it('fails a permanently refused transfer at once, with no retry job', async () => {
    const { seller } = await seedPayableShop('connect-permanent');
    stripeClient.failuresRemaining = 1;
    stripeClient.permanentFailure = true;

    const response = await requestManualPayout(seller, PAYOUT_AMOUNT_MINOR).expect(200);

    expect(response.body.payout).toMatchObject({
      amount_minor: PAYOUT_AMOUNT_MINOR,
      state: 'failed',
      reason: 'Your balance is insufficient to cover the requested transfer.',
    });

    const payouts = await readPayouts(seller.shopId);
    expect(payouts).toHaveLength(1);
    expect(payouts[0]).toMatchObject({
      state: 'failed',
      provider_reference: null,
    });

    // A 4xx will not become possible in minutes: nothing is scheduled, nothing
    // is discharged, and the seller hears about the failure exactly once.
    expect(stripeClient.calls).toHaveLength(1);
    expect(jobDispatcher.named('payout.retry')).toHaveLength(0);
    expect(await readJournalEntryCount(payouts[0]!.id)).toBe(0);
    expect(await readAvailableMinor(seller.shopId)).toBe(PAYOUT_AMOUNT_MINOR);

    const notifications = await readPayoutNotifications(seller.userId);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ type: 'seller.payout.failed' });
  });
});
