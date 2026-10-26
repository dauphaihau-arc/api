import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MikroORM } from '@mikro-orm/postgresql';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import type Stripe from 'stripe';
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
import { PaymentGateway } from '~/integrations/payment/app/ports/payment-gateway';
import { StripePaymentGateway } from '~/integrations/payment/infra/stripe-payment.gateway';
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

type TransferEventRow = {
  payout_id: string | null;
  status: string;
  amount_minor: number;
  currency: string;
  reversed_amount_minor: number;
  destination_account_id: string | null;
  occurred_at: Date;
};

type ConnectedPayoutRow = {
  provider_payout_id: string;
  provider_account_id: string | null;
  status: string;
  amount_minor: number;
  currency: string;
  arrival_date: string;
  failure_code: string | null;
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

class NoopJobDispatcher extends JobDispatcher {
  async dispatch<TName extends AppJobName>(
    _name: TName,
    _payload: AppJobPayloadMap[TName],
    _options?: DispatchJobOptions,
  ): Promise<void> {}
}

/**
 * The real Stripe gateway with its SDK client replaced: the test posts a raw
 * Stripe event body, `constructEvent` returns it, and production mapping runs.
 */
function buildWebhookGateway(): StripePaymentGateway {
  const gateway = new StripePaymentGateway({
    stripeSecretKey: 'sk_test_event_feed',
    stripeWebhookSecretKey: 'whsec_event_feed',
    appBaseUrl: 'https://shop.example',
    checkoutSessionTtlMs: 60 * 60 * 1000,
  });
  const internals = gateway as unknown as {
    stripe: {
      webhooks: {
        constructEvent: (payload: Buffer) => Stripe.Event;
      };
    };
  };
  internals.stripe = {
    webhooks: {
      constructEvent: payload => JSON.parse(payload.toString()) as Stripe.Event,
    },
  };

  return gateway;
}

describe('Stripe Connect event feed (integration)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: TestDatabase;
  let storageRoot: string;
  let sql: Client;
  let seller: TestSeller;
  let payoutAccountId: string;
  let providerAccountId: string;
  let payoutId: string;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase('finance_connect_event_feed');
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-connect-feed-int-'));

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
      .useValue(new NoopJobDispatcher())
      .overrideProvider(PaymentGateway)
      .useValue(buildWebhookGateway())
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

    seller = await registerSeller('connect-feed');
    providerAccountId = await seedConnectedPayoutAccount(seller.shopId);
    payoutId = await seedPaidPayout(seller.shopId, 'tr_evt_1');
  });

  afterAll(async () => {
    if (sql) await sql.end();
    if (app) await app.close();
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
    restoreProcessEnv(originalEnv);
    if (testDb) await dropTestDatabase(testDb);
  });

  beforeEach(async () => {
    await sql.query('delete from "connected_payouts"');
    await sql.query('delete from "provider_transfer_events"');
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
        shop_name: `feed${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`,
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

  async function seedConnectedPayoutAccount(shopId: string): Promise<string> {
    const id = randomUUID();
    providerAccountId = `acct_test_${id.replace(/-/g, '')}`;
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
    payoutAccountId = id;

    return providerAccountId;
  }

  async function seedPaidPayout(shopId: string, transferId: string): Promise<string> {
    const id = randomUUID();
    await sql.query(
      `insert into "payouts" (
         "id", "created_at", "updated_at", "public_id", "shop_id",
         "payout_account_id", "currency", "amount_minor", "state",
         "provider_reference", "attempt_count", "run_day", "paid_at"
       )
       values ($1, now(), now(), $2, $3, $4, 'USD', $5, 'paid', $6, 1,
               current_date, now())`,
      [id, `pay_evt_${id.replace(/-/g, '')}`.slice(0, 32), shopId, payoutAccountId,
        PAYOUT_AMOUNT_MINOR, transferId],
    );

    return id;
  }

  function postEvent(event: Record<string, unknown>) {
    return seller.agent
      .post(`${API_PREFIX}/webhooks/stripe`)
      .set('stripe-signature', 'sig_test')
      .send(event);
  }

  function transferEvent(
    eventId: string,
    type: 'transfer.created' | 'transfer.updated' | 'transfer.reversed',
    transferId: string,
    created: number,
    reversals: Array<{ amount: number }>,
  ) {
    return {
      id: eventId,
      type,
      account: providerAccountId,
      created,
      data: {
        object: {
          id: transferId,
          object: 'transfer',
          amount: PAYOUT_AMOUNT_MINOR,
          currency: 'usd',
          destination: providerAccountId,
          reversals: { data: reversals, has_more: false },
        },
      },
    };
  }

  function payoutEvent(
    eventId: string,
    type: 'payout.paid' | 'payout.failed',
    created: number,
    failureCode: string | null,
  ) {
    return {
      id: eventId,
      type,
      account: providerAccountId,
      created,
      data: {
        object: {
          id: 'po_evt_1',
          object: 'payout',
          amount: PAYOUT_AMOUNT_MINOR,
          currency: 'usd',
          arrival_date: 1_792_886_400,
          failure_code: failureCode,
          status: type === 'payout.paid' ? 'paid' : 'failed',
        },
      },
    };
  }

  async function readTransferEvents(): Promise<TransferEventRow[]> {
    return (await sql.query(
      `select "payout_id", "status", "amount_minor", "currency",
              "reversed_amount_minor", "destination_account_id", "occurred_at"
       from "provider_transfer_events" order by "occurred_at" asc`,
    )).rows as TransferEventRow[];
  }

  async function readConnectedPayouts(): Promise<ConnectedPayoutRow[]> {
    return (await sql.query(
      `select "provider_payout_id", "provider_account_id", "status",
              "amount_minor", "currency", "arrival_date", "failure_code"
       from "connected_payouts"`,
    )).rows as ConnectedPayoutRow[];
  }

  async function readPayout(): Promise<{
    id: string;
    state: string;
    provider_reference: string | null;
    amount_minor: number;
  }> {
    const rows = (await sql.query(
      `select "id", "state", "provider_reference", "amount_minor"
       from "payouts" where "id" = $1`,
      [payoutId],
    )).rows;

    return rows[0] as {
      id: string;
      state: string;
      provider_reference: string | null;
      amount_minor: number;
    };
  }

  async function countJournalEntries(): Promise<number> {
    const rows = (await sql.query(
      'select count(*)::int as "count" from "journal_entries"',
    )).rows as Array<{ count: number }>;

    return rows[0]!.count;
  }

  it('records a reversed transfer matched to its paid Payout without touching the ledger', async () => {
    const journalEntriesBefore = await countJournalEntries();

    await postEvent(transferEvent(
      'evt_tr_reversed_1',
      'transfer.reversed',
      'tr_evt_1',
      1_792_800_000,
      [{ amount: 2_500 }, { amount: 1_000 }],
    )).expect(201);

    const events = await readTransferEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      payout_id: payoutId,
      status: 'reversed',
      amount_minor: PAYOUT_AMOUNT_MINOR,
      currency: 'USD',
      reversed_amount_minor: 3_500,
      destination_account_id: providerAccountId,
    });
    expect(events[0]!.occurred_at).toEqual(new Date(1_792_800_000 * 1000));

    // Evidence only: the Payout keeps its state and the ledger is untouched.
    expect(await readPayout()).toEqual({
      id: payoutId,
      state: 'paid',
      provider_reference: 'tr_evt_1',
      amount_minor: PAYOUT_AMOUNT_MINOR,
    });
    expect(await countJournalEntries()).toBe(journalEntriesBefore);

    // A replayed webhook records no second row.
    await postEvent(transferEvent(
      'evt_tr_reversed_1',
      'transfer.reversed',
      'tr_evt_1',
      1_792_800_000,
      [{ amount: 2_500 }, { amount: 1_000 }],
    )).expect(201);

    expect(await readTransferEvents()).toHaveLength(1);
  });

  it('keeps a transfer event for an unknown transfer with a null Payout', async () => {
    await postEvent(transferEvent(
      'evt_tr_created_unknown',
      'transfer.created',
      'tr_unknown',
      1_792_800_100,
      [],
    )).expect(201);

    const events = await readTransferEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      payout_id: null,
      status: 'created',
      reversed_amount_minor: 0,
      destination_account_id: providerAccountId,
    });
  });

  it('upserts one connected payout from paid to failed and ignores a replay', async () => {
    await postEvent(payoutEvent('evt_po_paid_1', 'payout.paid', 1_792_800_200, null))
      .expect(201);

    const paid = await readConnectedPayouts();
    expect(paid).toHaveLength(1);
    expect(paid[0]).toMatchObject({
      provider_payout_id: 'po_evt_1',
      provider_account_id: providerAccountId,
      status: 'paid',
      amount_minor: PAYOUT_AMOUNT_MINOR,
      currency: 'USD',
      failure_code: null,
    });

    await postEvent(
      payoutEvent('evt_po_failed_1', 'payout.failed', 1_792_800_300, 'account_closed'),
    ).expect(201);

    const failed = await readConnectedPayouts();
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({
      provider_payout_id: 'po_evt_1',
      provider_account_id: providerAccountId,
      status: 'failed',
      failure_code: 'account_closed',
    });

    // A webhook that arrives out of order cannot roll the outcome back.
    await postEvent(payoutEvent('evt_po_paid_stale', 'payout.paid', 1_792_800_250, null))
      .expect(201);

    expect(await readConnectedPayouts()).toHaveLength(1);
    expect((await readConnectedPayouts())[0]).toMatchObject({
      status: 'failed',
      failure_code: 'account_closed',
    });

    await postEvent(
      payoutEvent('evt_po_failed_1', 'payout.failed', 1_792_800_300, 'account_closed'),
    ).expect(201);

    expect(await readConnectedPayouts()).toHaveLength(1);
  });
});
