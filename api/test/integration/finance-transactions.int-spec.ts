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
import { createPublicId } from '~/platform/ids/public-id';
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
import { ObservabilityService } from '~/platform/observability/observability.service';
import { RequestContextService } from '~/platform/request-context/request-context.service';
import { createTestDatabase, dropTestDatabase } from '../support/test-postgres';
import type { TestDatabaseContext } from '../support/test-postgres';
import { seedAuthReferenceData } from '../../database/seeds/auth.seed';
import { resolveShopId } from '../support/shipping-fixtures';

jest.setTimeout(240_000);

const API_PREFIX = '/v1';
const VALID_TEST_PASSWORD = 'Password123!';

type TestDatabase = TestDatabaseContext;

type TestAgent = { agent: Agent; email: string; userId: string };
type TestSeller = TestAgent & { shopId: string; shopPublicId: string };

type TransactionRow = {
  date: string;
  reference: string;
  order_number: string | null;
  payout_number: string | null;
  type: 'order_income' | 'refund' | 'payout';
  status: string;
  order_amount_minor: number | null;
  fees_minor: number | null;
  net_amount_minor: number;
  currency: string;
  source: 'scheduled' | 'manual' | null;
};

type TransactionsResponse = {
  transactions: TransactionRow[];
  total_results: number;
  page: number;
  limit: number;
};

class NoopJobDispatcher extends JobDispatcher {
  async dispatch<TName extends AppJobName>(
    _name: TName,
    _payload: AppJobPayloadMap[TName],
    _options?: DispatchJobOptions,
  ): Promise<void> {}
}

/**
 * The transaction timeline is a read model: no provider call is part of it.
 * The double only satisfies the gateway seam AppModule wires.
 */
class UnusedPaymentGateway extends PaymentGateway {
  async createCheckoutSession(): Promise<never> {
    throw new Error('PaymentGateway is not used by the transactions suite');
  }

  constructWebhookEvent(): never {
    throw new Error('PaymentGateway is not used by the transactions suite');
  }

  async retrieveCheckoutSession(): Promise<never> {
    throw new Error('PaymentGateway is not used by the transactions suite');
  }

  async createRefund(): Promise<never> {
    throw new Error('PaymentGateway is not used by the transactions suite');
  }

  async retrieveRefund(): Promise<never> {
    throw new Error('PaymentGateway is not used by the transactions suite');
  }
}

function restoreProcessEnv(originalEnv: NodeJS.ProcessEnv) {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

// eslint-disable-next-line max-lines-per-function
describe('Shop transactions timeline (integration)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: TestDatabase;
  let storageRoot: string;
  let sql: Client;

  let primarySeller: TestSeller;
  let otherSeller: TestSeller;

  const seeded = {
    pendingOrder: { publicId: '', internalId: '', orderNumber: 'ORD-1001' },
    releasedOrder: { publicId: '', internalId: '', orderNumber: 'ORD-1002' },
    refundedOrder: { publicId: '', internalId: '', orderNumber: 'ORD-1003' },
    sameInstantOrders: [] as Array<{
      publicId: string;
      internalId: string;
      orderNumber: string;
    }>,
    otherShopOrder: { publicId: '', internalId: '', orderNumber: 'ORD-1006' },
    paidPayout: { publicId: '', payoutNumber: '' },
    pendingPayout: { publicId: '', payoutNumber: '' },
    blockedPayout: { publicId: '', payoutNumber: '' },
  };

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase('finance_transactions');
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-transactions-int-'));

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

    // AppModule must be loaded AFTER the throwaway database env is applied.
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
      .useValue(new UnusedPaymentGateway())
      .compile();

    app = moduleFixture.createNestApplication();
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

    primarySeller = await registerSeller('transactions-primary');
    otherSeller = await registerSeller('transactions-other');

    await seedShopFacts(primarySeller.shopId, otherSeller.shopId);
  });

  afterAll(async () => {
    if (sql) {
      await sql.end();
    }

    if (app) {
      await app.close();
    }

    if (storageRoot) {
      await rm(storageRoot, { recursive: true, force: true });
    }

    restoreProcessEnv(originalEnv);

    if (testDb) {
      await dropTestDatabase(testDb);
    }
  });

  async function registerAgent(prefix: string, displayName: string): Promise<TestAgent> {
    const agent = request.agent(app.getHttpServer());
    const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.com`;

    const registerResponse = await agent
      .post(`${API_PREFIX}/auth/register`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', `198.51.100.${Math.floor(Math.random() * 200) + 1}`)
      .send({ email, password: VALID_TEST_PASSWORD, displayName })
      .expect(201);

    return { agent, email, userId: registerResponse.body.user.id as string };
  }

  async function registerSeller(prefix: string): Promise<TestSeller> {
    const created = await registerAgent(prefix, 'Seller');
    const sellerRole = await sql.query('select "id" from "roles" where "key" = \'seller\'');
    await sql.query(
      `insert into "user_roles" ("id", "created_at", "updated_at", "assigned_at", "user_id", "role_id")
       values ($1, now(), now(), now(), $2, $3)`,
      [randomUUID(), created.userId, sellerRole.rows[0].id],
    );

    const shopResponse = await created.agent
      .post(`${API_PREFIX}/shops`)
      .set('Idempotency-Key', randomUUID())
      .send({
        shop_name: `tx${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`,
        currency: 'USD',
      })
      .expect(201);

    const shopPublicId = shopResponse.body.id as string;

    return {
      ...created,
      shopId: await resolveShopId(sql, shopPublicId),
      shopPublicId,
    };
  }

  async function ensureLedgerAccount(
    kind: 'seller_payable' | 'platform_commission' | 'platform_clearing',
    currency: string,
    shopInternalId?: string,
  ): Promise<string> {
    const accountKey = shopInternalId
      ? `${kind}:${currency}:${shopInternalId}`
      : `${kind}:${currency}`;
    const rows = await sql.query<{ id: string }>(
      `insert into "ledger_accounts" (
         "id", "created_at", "updated_at", "account_key", "kind", "currency", "shop_id"
       )
       values ($1, now(), now(), $2, $3, $4, $5)
       on conflict ("account_key") do update
       set "updated_at" = "ledger_accounts"."updated_at"
       returning "id"`,
      [randomUUID(), accountKey, kind, currency, shopInternalId ?? null],
    );

    return rows.rows[0].id;
  }

  async function insertOrder(
    shopInternalId: string,
    publicId: string,
    orderNumber: string,
    createdAt: string,
    amountMinor: number,
  ): Promise<string> {
    const id = randomUUID();
    const amountMajor = (amountMinor / 100).toFixed(2);

    await sql.query(
      `insert into "orders" (
         "id", "created_at", "updated_at", "public_id", "order_number",
         "customer_email", "shop_id",
         "payment_type", "status", "shipping_status", "currency",
         "subtotal", "total_shipping_fee", "total_discount", "total",
         "shipping_address", "shipping_to_country",
         "subtotal_minor", "shipping_minor", "discount_minor", "total_minor",
         "fulfillment_status"
       )
       values ($1, $2, $2, $3, $4, $5, $6, 'card', 'paid', 'pre_transit', 'USD',
               $7, 0, 0, $7, cast($8 as jsonb), 'US', $9, 0, 0, $9, 'unfulfilled')`,
      [
        id,
        createdAt,
        publicId,
        orderNumber,
        'transactions-buyer@example.com',
        shopInternalId,
        amountMajor,
        JSON.stringify({
          full_name: 'Transactions Buyer',
          address_1: '1 Main St',
          city: 'Los Angeles',
          state: 'CA',
          zip: '90001',
          country: 'US',
        }),
        amountMinor,
      ],
    );

    return id;
  }

  async function insertJournalEntry(input: {
    shopInternalId: string;
    moneyEventKey: string;
    moneyEventKind: string;
    amountMinor: number;
    /** Platform Commission posting; omitted means the Entry carries no fee. */
    commissionMinor?: number;
    occurredAt: string;
  }): Promise<void> {
    const entryId = randomUUID();
    const sellerAccountId = await ensureLedgerAccount(
      'seller_payable',
      'USD',
      input.shopInternalId,
    );
    const clearingAccountId = await ensureLedgerAccount('platform_clearing', 'USD');
    const clearingMinor = -(input.amountMinor + (input.commissionMinor ?? 0));

    await sql.query(
      `insert into "journal_entries" (
         "id", "created_at", "updated_at", "money_event_key", "money_event_kind",
         "shop_id", "currency", "occurred_at"
       )
       values ($1, $2, $2, $3, $4, $5, 'USD', $2)`,
      [
        entryId,
        input.occurredAt,
        input.moneyEventKey,
        input.moneyEventKind,
        input.shopInternalId,
      ],
    );
    await sql.query(
      `insert into "postings" (
         "id", "created_at", "updated_at", "journal_entry_id", "ledger_account_id", "amount_minor"
       )
       values ($1, now(), now(), $2, $3, $4),
              ($5, now(), now(), $2, $6, $7)`,
      [
        randomUUID(),
        entryId,
        sellerAccountId,
        input.amountMinor,
        randomUUID(),
        clearingAccountId,
        clearingMinor,
      ],
    );

    if (input.commissionMinor !== undefined) {
      const commissionAccountId = await ensureLedgerAccount('platform_commission', 'USD');

      await sql.query(
        `insert into "postings" (
           "id", "created_at", "updated_at", "journal_entry_id", "ledger_account_id", "amount_minor"
         )
         values ($1, now(), now(), $2, $3, $4)`,
        [randomUUID(), entryId, commissionAccountId, input.commissionMinor],
      );
    }
  }

  async function insertPayout(input: {
    shopInternalId: string;
    amountMinor: number;
    state: 'pending' | 'paid' | 'blocked' | 'failed';
    source: 'scheduled' | 'manual';
    periodKey: string;
    createdAt: string;
    paidAt?: string | null;
    reason?: string | null;
  }): Promise<{ publicId: string; payoutNumber: string }> {
    const publicId = createPublicId('pay');

    const rows = await sql.query<{ payout_number: string }>(
      `insert into "payouts" (
         "id", "created_at", "updated_at", "public_id", "shop_id",
         "payout_account_id", "currency", "amount_minor", "state", "source",
         "period_key", "quota_consumed", "reason", "attempt_count", "run_day", "paid_at"
       )
       values ($1, $2, $2, $3, $4, null, 'USD', $5, $6, $7, $8, true, $9, 1, $10, $11)
       returning "payout_number"`,
      [
        randomUUID(),
        input.createdAt,
        publicId,
        input.shopInternalId,
        input.amountMinor,
        input.state,
        input.source,
        input.periodKey,
        input.reason ?? null,
        input.createdAt.slice(0, 10),
        input.paidAt ?? null,
      ],
    );

    return {
      publicId,
      payoutNumber: rows.rows[0]!.payout_number,
    };
  }

  async function seedShopFacts(
    primaryShopId: string,
    otherShopId: string,
  ): Promise<void> {
    seeded.pendingOrder.publicId = createPublicId('ord');
    seeded.pendingOrder.internalId = await insertOrder(
      primaryShopId,
      seeded.pendingOrder.publicId,
      seeded.pendingOrder.orderNumber,
      '2026-10-01T10:00:00.000Z',
      12_500,
    );
    await insertJournalEntry({
      shopInternalId: primaryShopId,
      moneyEventKey: `order.paid:${seeded.pendingOrder.internalId}`,
      moneyEventKind: 'order.paid',
      amountMinor: 10_000,
      commissionMinor: 2_500,
      occurredAt: '2026-10-01T10:00:00.000Z',
    });

    seeded.releasedOrder.publicId = createPublicId('ord');
    seeded.releasedOrder.internalId = await insertOrder(
      primaryShopId,
      seeded.releasedOrder.publicId,
      seeded.releasedOrder.orderNumber,
      '2026-10-02T10:00:00.000Z',
      22_000,
    );
    await insertJournalEntry({
      shopInternalId: primaryShopId,
      moneyEventKey: `order.paid:${seeded.releasedOrder.internalId}`,
      moneyEventKind: 'order.paid',
      amountMinor: 20_000,
      commissionMinor: 2_000,
      occurredAt: '2026-10-02T10:00:00.000Z',
    });
    await sql.query(
      `insert into "payout_availabilities" (
         "id", "created_at", "updated_at", "order_id", "shop_id", "currency",
         "amount_minor", "delivered_at", "evidence"
       )
       values ($1, now(), now(), $2, $3, 'USD', $4, $5, '[]'::jsonb)`,
      [
        randomUUID(),
        seeded.releasedOrder.internalId,
        primaryShopId,
        20_000,
        '2026-10-02T12:00:00.000Z',
      ],
    );

    seeded.refundedOrder.publicId = createPublicId('ord');
    seeded.refundedOrder.internalId = await insertOrder(
      primaryShopId,
      seeded.refundedOrder.publicId,
      seeded.refundedOrder.orderNumber,
      '2026-10-03T10:00:00.000Z',
      8_800,
    );
    await insertJournalEntry({
      shopInternalId: primaryShopId,
      moneyEventKey: `order.paid:${seeded.refundedOrder.internalId}`,
      moneyEventKind: 'order.paid',
      amountMinor: 8_000,
      commissionMinor: 800,
      occurredAt: '2026-10-03T10:00:00.000Z',
    });
    await sql.query(
      `insert into "payout_availabilities" (
         "id", "created_at", "updated_at", "order_id", "shop_id", "currency",
         "amount_minor", "delivered_at", "evidence"
       )
       values ($1, now(), now(), $2, $3, 'USD', $4, $5, '[]'::jsonb)`,
      [
        randomUUID(),
        seeded.refundedOrder.internalId,
        primaryShopId,
        3_000,
        '2026-10-03T12:00:00.000Z',
      ],
    );
    await insertJournalEntry({
      shopInternalId: primaryShopId,
      moneyEventKey: `order.refund:${seeded.refundedOrder.internalId}:${randomUUID()}`,
      moneyEventKind: 'order.refunded',
      amountMinor: -4_500,
      commissionMinor: -500,
      occurredAt: '2026-10-04T10:00:00.000Z',
    });

    const paidPayout = await insertPayout({
      shopInternalId: primaryShopId,
      amountMinor: 15_000,
      state: 'paid',
      source: 'scheduled',
      periodKey: '2026-08',
      createdAt: '2026-10-05T10:00:00.000Z',
      paidAt: '2026-10-05T10:05:00.000Z',
    });
    seeded.paidPayout.publicId = paidPayout.publicId;
    seeded.paidPayout.payoutNumber = paidPayout.payoutNumber;

    const pendingPayout = await insertPayout({
      shopInternalId: primaryShopId,
      amountMinor: 3_000,
      state: 'pending',
      source: 'manual',
      periodKey: '2026-10',
      createdAt: '2026-10-06T10:00:00.000Z',
    });
    seeded.pendingPayout.publicId = pendingPayout.publicId;
    seeded.pendingPayout.payoutNumber = pendingPayout.payoutNumber;

    const blockedPayout = await insertPayout({
      shopInternalId: primaryShopId,
      amountMinor: 7_000,
      state: 'blocked',
      source: 'scheduled',
      periodKey: '2026-09',
      createdAt: '2026-10-07T10:00:00.000Z',
      reason: 'no_payout_account',
    });
    seeded.blockedPayout.publicId = blockedPayout.publicId;
    seeded.blockedPayout.payoutNumber = blockedPayout.payoutNumber;

    // Two rows recorded at the same instant: the id tiebreak must keep them
    // from repeating or disappearing when a page boundary falls between them.
    for (const amountMinor of [5_000, 6_000]) {
      const order = {
        publicId: createPublicId('ord'),
        internalId: '',
        orderNumber: `ORD-100${seeded.sameInstantOrders.length + 4}`,
      };
      order.internalId = await insertOrder(
        primaryShopId,
        order.publicId,
        order.orderNumber,
        '2026-10-08T10:00:00.000Z',
        amountMinor,
      );
      await insertJournalEntry({
        shopInternalId: primaryShopId,
        moneyEventKey: `order.paid:${order.internalId}`,
        moneyEventKind: 'order.paid',
        amountMinor,
        occurredAt: '2026-10-08T10:00:00.000Z',
      });
      seeded.sameInstantOrders.push(order);
    }

    seeded.otherShopOrder.publicId = createPublicId('ord');
    seeded.otherShopOrder.internalId = await insertOrder(
      otherShopId,
      seeded.otherShopOrder.publicId,
      seeded.otherShopOrder.orderNumber,
      '2026-10-09T10:00:00.000Z',
      99_999,
    );
    await insertJournalEntry({
      shopInternalId: otherShopId,
      moneyEventKey: `order.paid:${seeded.otherShopOrder.internalId}`,
      moneyEventKind: 'order.paid',
      amountMinor: 99_999,
      occurredAt: '2026-10-09T10:00:00.000Z',
    });
  }

  function listTransactions(
    seller: TestSeller,
    query: Record<string, string> = {},
  ): Promise<TransactionsResponse> {
    return seller.agent
      .get(`${API_PREFIX}/shops/${seller.shopPublicId}/finance/transactions`)
      .query(query)
      .expect(200)
      .then(response => response.body as TransactionsResponse);
  }

  function findRow(
    response: TransactionsResponse,
    reference: string,
    type: TransactionRow['type'],
  ): TransactionRow {
    const row = response.transactions.find(
      candidate => candidate.reference === reference && candidate.type === type,
    );

    if (!row) {
      throw new Error(`No ${type} row for ${reference}`);
    }

    return row;
  }

  it('returns signed rows for Order income, Refunds, and Payouts, newest first', async () => {
    const response = await listTransactions(primarySeller);

    expect(response.transactions).toHaveLength(9);
    expect(response.total_results).toBe(9);
    expect(response.page).toBe(1);
    expect(response.limit).toBe(20);

    const dates = response.transactions.map(row => row.date);
    expect(dates).toEqual([...dates].sort().reverse());

    expect(findRow(response, seeded.pendingOrder.publicId, 'order_income')).toEqual({
      date: '2026-10-01T10:00:00.000Z',
      reference: seeded.pendingOrder.publicId,
      order_number: seeded.pendingOrder.orderNumber,
      payout_number: null,
      type: 'order_income',
      status: 'pending',
      order_amount_minor: 12_500,
      fees_minor: -2_500,
      net_amount_minor: 10_000,
      currency: 'USD',
      source: null,
    });

    const refund = findRow(response, seeded.refundedOrder.publicId, 'refund');
    expect(refund).toMatchObject({
      date: '2026-10-04T10:00:00.000Z',
      order_number: seeded.refundedOrder.orderNumber,
      payout_number: null,
      status: 'deducted',
      order_amount_minor: -5_000,
      fees_minor: 500,
      net_amount_minor: -4_500,
      currency: 'USD',
      source: null,
    });
    expect(findRow(response, seeded.refundedOrder.publicId, 'order_income')).toMatchObject({
      order_number: seeded.refundedOrder.orderNumber,
      status: 'released',
      order_amount_minor: 8_800,
      fees_minor: -800,
      net_amount_minor: 8_000,
    });

    expect(findRow(response, seeded.paidPayout.payoutNumber, 'payout')).toMatchObject({
      date: '2026-10-05T10:00:00.000Z',
      reference: seeded.paidPayout.payoutNumber,
      order_number: null,
      payout_number: seeded.paidPayout.payoutNumber,
      status: 'paid',
      order_amount_minor: null,
      fees_minor: null,
      net_amount_minor: -15_000,
      currency: 'USD',
      source: 'scheduled',
    });
    expect(findRow(response, seeded.pendingPayout.payoutNumber, 'payout')).toMatchObject({
      reference: seeded.pendingPayout.payoutNumber,
      order_number: null,
      payout_number: seeded.pendingPayout.payoutNumber,
      status: 'pending',
      order_amount_minor: null,
      fees_minor: null,
      net_amount_minor: -3_000,
      source: 'manual',
    });
    expect(findRow(response, seeded.blockedPayout.payoutNumber, 'payout')).toMatchObject({
      reference: seeded.blockedPayout.payoutNumber,
      order_number: null,
      payout_number: seeded.blockedPayout.payoutNumber,
      status: 'blocked',
      order_amount_minor: null,
      fees_minor: null,
      net_amount_minor: -7_000,
      source: 'scheduled',
    });

    // The gross amount and the fee always reconstruct the Seller Payable
    // posting on an Order row, whatever its type or sign.
    for (const row of response.transactions.filter(transaction => transaction.type !== 'payout')) {
      expect(row.order_amount_minor! + row.fees_minor!).toBe(row.net_amount_minor);
    }

    for (const row of response.transactions.filter(transaction => transaction.type === 'payout')) {
      expect(row.order_amount_minor).toBeNull();
      expect(row.fees_minor).toBeNull();
    }
    expect(seeded.paidPayout.payoutNumber).toMatch(/^PAY-\d{8}-\d{6}$/);

    // The other shop's income never leaks into this shop's timeline.
    expect(response.transactions.some(
      row => row.reference === seeded.otherShopOrder.publicId,
    )).toBe(false);
  });

  it('marks Order income released only when Payout Availability is recorded', async () => {
    const response = await listTransactions(primarySeller, {
      type: 'order_income',
      status: 'released',
    });

    const references = response.transactions.map(row => row.reference).sort();
    expect(references).toEqual([
      seeded.refundedOrder.publicId,
      seeded.releasedOrder.publicId,
    ].sort());
    expect(response.transactions.every(row => row.net_amount_minor > 0)).toBe(true);
    expect(response.total_results).toBe(2);

    const pending = await listTransactions(primarySeller, {
      type: 'order_income',
      status: 'pending',
    });
    expect(pending.transactions.map(row => row.reference).sort()).toEqual([
      seeded.pendingOrder.publicId,
      ...seeded.sameInstantOrders.map(order => order.publicId),
    ].sort());
    expect(pending.total_results).toBe(3);
  });

  it('filters by type, status, and an inclusive date range', async () => {
    const refunds = await listTransactions(primarySeller, { type: 'refund' });
    expect(refunds.transactions).toHaveLength(1);
    expect(refunds.total_results).toBe(1);
    expect(refunds.transactions[0]).toMatchObject({
      reference: seeded.refundedOrder.publicId,
      order_number: seeded.refundedOrder.orderNumber,
      payout_number: null,
      order_amount_minor: -5_000,
      fees_minor: 500,
      net_amount_minor: -4_500,
      status: 'deducted',
    });

    const paidPayouts = await listTransactions(primarySeller, {
      type: 'payout',
      status: 'paid',
    });
    expect(paidPayouts.transactions.map(row => row.reference)).toEqual([
      seeded.paidPayout.payoutNumber,
    ]);
    expect(paidPayouts.transactions.map(row => row.order_number)).toEqual([null]);
    expect(paidPayouts.transactions.map(row => row.payout_number)).toEqual([
      seeded.paidPayout.payoutNumber,
    ]);
    expect(paidPayouts.total_results).toBe(1);

    const window = await listTransactions(primarySeller, {
      date_from: '2026-10-03T00:00:00.000Z',
      date_to: '2026-10-05T10:00:00.000Z',
    });
    expect(window.total_results).toBe(3);
    expect(window.transactions.map(row => row.date)).toEqual([
      '2026-10-05T10:00:00.000Z',
      '2026-10-04T10:00:00.000Z',
      '2026-10-03T10:00:00.000Z',
    ]);
  });

  it('pages with a stable id tiebreak and no gaps or repeats', async () => {
    const first = await listTransactions(primarySeller, {
      page: '1',
      limit: '1',
    });
    const second = await listTransactions(primarySeller, {
      page: '2',
      limit: '1',
    });

    expect(first.page).toBe(1);
    expect(first.limit).toBe(1);
    expect(first.total_results).toBe(9);
    expect(first.transactions).toHaveLength(1);
    expect(second.page).toBe(2);
    expect(second.limit).toBe(1);
    expect(second.total_results).toBe(9);
    expect(second.transactions).toHaveLength(1);

    // Both newest rows share an instant; the id tiebreak still splits them.
    expect(first.transactions[0]!.date).toBe('2026-10-08T10:00:00.000Z');
    expect(second.transactions[0]!.date).toBe('2026-10-08T10:00:00.000Z');
    expect([first.transactions[0]!.reference, second.transactions[0]!.reference].sort())
      .toEqual(seeded.sameInstantOrders.map(order => order.publicId).sort());

    const seen: string[] = [];

    for (const page of ['1', '2', '3']) {
      const response = await listTransactions(primarySeller, {
        page,
        limit: '4',
      });

      expect(response.page).toBe(Number(page));
      expect(response.limit).toBe(4);
      expect(response.total_results).toBe(9);
      expect(response.transactions.length).toBeLessThanOrEqual(4);
      seen.push(...response.transactions.map(
        row => `${row.type}:${row.reference}:${row.date}`,
      ));
    }

    expect(seen).toHaveLength(9);
    expect(new Set(seen).size).toBe(9);
    expect(seen).toEqual(expect.arrayContaining([
      `order_income:${seeded.sameInstantOrders[0]!.publicId}:2026-10-08T10:00:00.000Z`,
      `order_income:${seeded.sameInstantOrders[1]!.publicId}:2026-10-08T10:00:00.000Z`,
    ]));
  });

  it('bounds the page number and page size', async () => {
    for (const query of [
      { page: '0' },
      { page: '-1' },
      { limit: '0' },
      { limit: '101' },
    ]) {
      await primarySeller.agent
        .get(`${API_PREFIX}/shops/${primarySeller.shopPublicId}/finance/transactions`)
        .query(query)
        .expect(400);
    }

    const beyond = await listTransactions(primarySeller, {
      page: '99',
      limit: '20',
    });

    expect(beyond.transactions).toEqual([]);
    expect(beyond.page).toBe(99);
    expect(beyond.total_results).toBe(9);
  });

  it('keeps each shop to its own timeline and refuses another shop', async () => {
    const other = await listTransactions(otherSeller);

    expect(other.transactions).toHaveLength(1);
    expect(other.total_results).toBe(1);
    expect(other.transactions[0]).toMatchObject({
      reference: seeded.otherShopOrder.publicId,
      order_amount_minor: 99_999,
      fees_minor: 0,
      net_amount_minor: 99_999,
      type: 'order_income',
      status: 'pending',
    });
    expect(other.transactions.some(
      row => row.reference === seeded.pendingOrder.publicId,
    )).toBe(false);

    await otherSeller.agent
      .get(`${API_PREFIX}/shops/${primarySeller.shopPublicId}/finance/transactions`)
      .expect(403);

    await primarySeller.agent
      .get(`${API_PREFIX}/shops/${otherSeller.shopPublicId}/finance/transactions`)
      .expect(403);
  });
});
