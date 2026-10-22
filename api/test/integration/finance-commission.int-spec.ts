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
import { ProductWhoMade } from '~/domains/product/domain/enums/product-who-made.enum';
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
  PaymentGateway,
  type CheckoutSessionResult,
  type CreateCheckoutSessionInput,
  type PaymentWebhookEvent,
} from '~/integrations/payment/app/ports/payment-gateway';
import { ObservabilityService } from '~/platform/observability/observability.service';
import { RequestContextService } from '~/platform/request-context/request-context.service';
import { FinanceMoneyEventProcessorService } from '~/domains/finance/app/services/finance-money-event-processor.service';
import { createTestDatabase, dropTestDatabase } from '../support/test-postgres';
import type { TestDatabaseContext } from '../support/test-postgres';
import { seedAuthReferenceData } from '../../database/seeds/auth.seed';
import { resolveShopId, seedPublishableInventory } from '../support/shipping-fixtures';

jest.setTimeout(240_000);

const API_PREFIX = '/v1';
const VALID_TEST_PASSWORD = 'Password123!';
const SCHEDULE_EFFECTIVE_FROM = '2020-01-01T00:00:00.000Z';
const FUTURE_EFFECTIVE_FROM = '2999-01-01T00:00:00.000Z';

type TestDatabase = TestDatabaseContext;

type TestAgent = { agent: Agent; email: string; userId: string };
type TestSeller = TestAgent & { shopId: string; shopPublicId: string };
type TestBuyer = TestAgent & { addressId: string };

type ShippingQuoteResponse = {
  quote_id: string;
  checkout_currency: string;
  subtotal_minor: number;
  shipping_minor: number;
  discount_minor: number;
  total_minor: number;
  shops: Array<{ shop_id: string; subtotal_minor: number }>;
};

type OrderMoneyRow = {
  id: string;
  currency: string;
  subtotal_minor: number;
  shipping_minor: number;
  discount_minor: number;
  total_minor: number;
};

type PayablePosition = {
  currency: string;
  available_minor: number;
  not_yet_available_minor: number;
};

type PayableResponse = PayablePosition;

type PaidOrder = {
  orderInternalId: string;
  orderPublicId: string;
  currency: string;
  creditMinor: number;
  moneyEventKey: string;
};

type CommissionScheduleResponse = {
  shop_id: string;
  effective_from: string;
  rate_basis_points: number;
};

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

/**
 * Background jobs (best-seller refresh, notifications) are outside this
 * suite's subject: the inline driver would otherwise run them inside the
 * request. The payment webhook itself no longer depends on a dispatcher.
 */
class NoopJobDispatcher extends JobDispatcher {
  async dispatch<TName extends AppJobName>(
    _name: TName,
    _payload: AppJobPayloadMap[TName],
    _options?: DispatchJobOptions,
  ): Promise<void> {}
}

/**
 * In-memory payment double. It stands in for the Stripe checkout-session and
 * webhook signature seams only; the Order's paid state, its `order.paid` outbox
 * row, and Finance's ledger all move through the real application.
 */
class FakePaymentGateway extends PaymentGateway {
  private nextEvent: PaymentWebhookEvent | null = null;

  queueEvent(event: PaymentWebhookEvent): void {
    this.nextEvent = event;
  }

  async createCheckoutSession(_input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult> {
    const id = `cs_test_${randomUUID().replace(/-/g, '')}`;

    return {
      id,
      url: `https://pay.test/${id}`,
      expiresAt: new Date(Date.now() + (60 * 60 * 1000)),
    };
  }

  constructWebhookEvent(_payload: Buffer, _signature?: string): PaymentWebhookEvent {
    if (!this.nextEvent) {
      throw new Error('No webhook event queued on FakePaymentGateway');
    }

    const event = this.nextEvent;
    this.nextEvent = null;

    return event;
  }

  async retrieveCheckoutSession(sessionId: string): Promise<{
    id: string;
    status: string;
    paymentStatus: string;
  }> {
    return { id: sessionId, status: 'complete', paymentStatus: 'paid' };
  }

  async createRefund(_paymentIntentId: string) {
    return { id: `re_test_${randomUUID()}`, status: 'succeeded', amount: 0 };
  }

  async retrieveRefund(refundId: string): Promise<never> {
    throw new Error(`No refund ${refundId} on this gateway`);
  }
}

/**
 * The Platform Commission on a discounted item subtotal, computed here from the
 * ticket's worked arithmetic (round half up of `discounted * bps / 10000`), so
 * the expectation never borrows the production formula.
 */
function expectedCommissionMinor(discountedItemSubtotalMinor: number, rateBasisPoints: number): number {
  if (discountedItemSubtotalMinor <= 0 || rateBasisPoints === 0) {
    return 0;
  }

  return Number(
    ((BigInt(discountedItemSubtotalMinor) * BigInt(rateBasisPoints)) + 5_000n) / 10_000n,
  );
}

// eslint-disable-next-line max-lines-per-function
describe('Platform Commission from a Commission Schedule (integration)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: TestDatabase;
  let storageRoot: string;
  let sql: Client;
  let gateway: FakePaymentGateway;
  let categoryId: string | undefined;

  let admin: TestAgent;
  let seller: TestSeller;
  let unrelatedSeller: TestSeller;
  let buyer: TestBuyer;
  let inventoryId: string;
  let shopInternalId: string;

  let firstPaidOrder: PaidOrder;
  let firstOrderPostingsSnapshot: unknown[];

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase('finance_commission');
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-commission-int-'));
    gateway = new FakePaymentGateway();

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
      .useValue(gateway)
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

    admin = await registerAdmin('fin-admin');
    seller = await registerSeller('fin-owner');
    shopInternalId = await resolveShopId(sql, seller.shopPublicId);
    unrelatedSeller = await registerSeller('fin-other');
    const profile = await createActiveProfile(seller);
    const product = await createPublishableProduct({
      seller,
      shippingProfileId: profile.id,
      title: 'Commission Mug',
      sku: `FIN-COMMISSION-${randomUUID()}`,
      amountMinor: 2500,
      stock: 25,
    });
    inventoryId = product.inventoryId;
    buyer = await registerBuyer('fin-buyer');
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
      .set('X-Forwarded-For', `203.0.113.${Math.floor(Math.random() * 200) + 1}`)
      .send({ email, password: VALID_TEST_PASSWORD, displayName })
      .expect(201);

    return { agent, email, userId: registerResponse.body.user.id as string };
  }

  async function registerAdmin(prefix: string): Promise<TestAgent> {
    const created = await registerAgent(prefix, 'Admin');
    const adminRole = await sql.query('select "id" from "roles" where "key" = \'admin\'');
    await sql.query(
      `insert into "user_roles" ("id", "created_at", "updated_at", "assigned_at", "user_id", "role_id")
       values ($1, now(), now(), now(), $2, $3)`,
      [randomUUID(), created.userId, adminRole.rows[0].id],
    );

    return created;
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
        shop_name: `fin${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`,
        currency: 'USD',
      })
      .expect(201);

    return {
      ...created,
      shopId: shopResponse.body.id as string,
      shopPublicId: shopResponse.body.id as string,
    };
  }

  async function registerBuyer(prefix: string): Promise<TestBuyer> {
    const created = await registerAgent(prefix, 'Buyer');

    const addressResponse = await created.agent
      .post(`${API_PREFIX}/me/addresses`)
      .set('Idempotency-Key', randomUUID())
      .send({
        full_name: 'Commission Buyer',
        address_1: '123 Main St',
        city: 'Los Angeles',
        state: 'CA',
        zip: '90001',
        country: 'US',
        phone: '123456789',
        is_primary: true,
      })
      .expect(201);

    return { ...created, addressId: addressResponse.body.address.id as string };
  }

  async function seedCategory(agent: Agent): Promise<string> {
    if (categoryId) {
      return categoryId;
    }

    const response = await agent
      .post(`${API_PREFIX}/categories`)
      .set('Idempotency-Key', randomUUID())
      .send({ name: 'Finance commission', rank: 1 })
      .expect(201);

    categoryId = response.body.id as string;

    return categoryId;
  }

  async function createActiveProfile(
    owner: TestSeller,
  ): Promise<{ id: string; version: number }> {
    const response = await owner.agent
      .post(`${API_PREFIX}/shops/${owner.shopPublicId}/shipping-profiles`)
      .set('Idempotency-Key', randomUUID())
      .send({
        name: `Standard ${Date.now().toString().slice(-6)}`,
        status: 'active',
        ship_from_country: 'US',
        ship_from_postal: '10001',
        processing_time_min_days: 1,
        processing_time_max_days: 3,
        rates: [
          {
            destination_scope: 'country',
            destination_country: 'US',
            one_item_fee_minor: 599,
            additional_item_fee_minor: 199,
            delivery_time_min_days: 3,
            delivery_time_max_days: 5,
          },
        ],
      })
      .expect(201);

    return { id: response.body.id as string, version: response.body.version as number };
  }

  async function createPublishableProduct(input: {
    seller: TestSeller;
    shippingProfileId: string;
    title: string;
    sku: string;
    amountMinor: number;
    stock: number;
  }): Promise<{ productId: string; inventoryId: string }> {
    const productResponse = await input.seller.agent
      .post(`${API_PREFIX}/shops/${input.seller.shopPublicId}/products`)
      .set('Idempotency-Key', randomUUID())
      .send({
        category_id: await seedCategory(input.seller.agent),
        title: input.title,
        description: 'Finance commission product',
        who_made: ProductWhoMade.I_DID,
        is_digital: false,
      })
      .expect(201);
    const productId = productResponse.body.id as string;
    const productPublicId = productResponse.body.id as string;

    await input.seller.agent
      .put(`${API_PREFIX}/shops/${input.seller.shopPublicId}/products/${productPublicId}/images`)
      .attach('images', Buffer.from(`image-${productId}`), {
        filename: `${productId}.jpg`,
        contentType: 'image/jpeg',
      })
      .expect(204);

    const detail = await input.seller.agent
      .get(`${API_PREFIX}/shops/${input.seller.shopPublicId}/products/${productPublicId}`)
      .expect(200);
    const productInventoryId = detail.body.inventory[0].id as string;

    await seedPublishableInventory(sql, {
      shopId: input.seller.shopId,
      inventoryId: productInventoryId,
      sku: input.sku,
      stock: input.stock,
      amountMinor: input.amountMinor,
    });

    await input.seller.agent
      .put(`${API_PREFIX}/shops/${input.seller.shopPublicId}/products/${productPublicId}/shipping-profile`)
      .set('Idempotency-Key', randomUUID())
      .send({ shipping_profile_id: input.shippingProfileId })
      .expect(204);

    await input.seller.agent
      .post(`${API_PREFIX}/shops/${input.seller.shopPublicId}/products/${productPublicId}/publish`)
      .set('Idempotency-Key', randomUUID())
      .expect(201);

    return { productId, inventoryId: productInventoryId };
  }

  async function addCartItem(target: TestBuyer, targetInventoryId: string, quantity: number): Promise<void> {
    await target.agent
      .post(`${API_PREFIX}/cart/items`)
      .set('Idempotency-Key', randomUUID())
      .send({ inventory_id: targetInventoryId, quantity })
      .expect(201);
  }

  async function createQuote(target: TestBuyer): Promise<ShippingQuoteResponse> {
    const response = await target.agent
      .post(`${API_PREFIX}/me/checkout/quote`)
      .set('Idempotency-Key', randomUUID())
      .send({ user_address_id: target.addressId });

    expect(response.body).toMatchObject({
      quote_id: expect.any(String),
      checkout_currency: expect.any(String),
      total_minor: expect.any(Number),
      shops: expect.any(Array),
    });

    return response.body as ShippingQuoteResponse;
  }

  async function confirmCardOrder(target: TestBuyer, quoteId: string) {
    return target.agent
      .post(`${API_PREFIX}/me/checkout`)
      .set('Idempotency-Key', randomUUID())
      .send({ quote_id: quoteId, payment_type: 'card' });
  }

  async function readOrderMoneyRow(orderPublicId: string): Promise<OrderMoneyRow> {
    const result = await sql.query(
      `select "id", "currency", "subtotal_minor", "shipping_minor", "discount_minor", "total_minor"
       from "orders" where "public_id" = $1`,
      [orderPublicId],
    );

    const row = result.rows[0] as OrderMoneyRow | undefined;

    if (!row) {
      throw new Error(`Order ${orderPublicId} was not found`);
    }

    return row;
  }

  async function readOrderSessionId(orderPublicId: string): Promise<string> {
    const result = await sql.query(
      `select "payment_details" ->> 'checkout_session_id' as "session_id"
       from "orders" where "public_id" = $1`,
      [orderPublicId],
    );

    const sessionId = result.rows[0]?.session_id as string | undefined;

    if (!sessionId) {
      throw new Error(`Order ${orderPublicId} has no checkout_session_id`);
    }

    return sessionId;
  }

  async function completeCardSession(sessionId: string): Promise<void> {
    gateway.queueEvent({
      id: `evt_${randomUUID()}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          paymentStatus: 'paid',
          paymentIntentId: `pi_${randomUUID()}`,
        },
      },
    });

    await request(app.getHttpServer())
      .post(`${API_PREFIX}/webhooks/stripe`)
      .send({ type: 'checkout.session.completed' })
      .expect(201);
  }

  /** The Finance processor is driven inline; the interval worker needs redis. */
  async function pumpFinance(): Promise<number> {
    return app.get(FinanceMoneyEventProcessorService).processPendingEvents();
  }

  /**
   * Places a card Order through the real checkout, pays it through the real
   * webhook, then pumps the Finance side. Returns the frozen money facts.
   */
  async function placeAndPayCardOrder(
    target: TestBuyer,
    targetInventoryId: string,
    quantity: number,
  ): Promise<PaidOrder> {
    await addCartItem(target, targetInventoryId, quantity);
    const quote = await createQuote(target);
    const orderResponse = await confirmCardOrder(target, quote.quote_id);
    expect(orderResponse.status).toBe(201);

    const orderPublicId = orderResponse.body.order_shops[0].id as string;
    const checkoutSessionId = await readOrderSessionId(orderPublicId);
    await completeCardSession(checkoutSessionId);
    await pumpFinance();

    const row = await readOrderMoneyRow(orderPublicId);
    const creditMinor = row.subtotal_minor - row.discount_minor + row.shipping_minor;

    return {
      orderInternalId: row.id,
      orderPublicId,
      currency: row.currency,
      creditMinor,
      moneyEventKey: `order.paid:${row.id}`,
    };
  }

  async function putCommissionSchedule(
    publicShopId: string,
    body: Record<string, unknown>,
  ) {
    return admin.agent
      .put(`${API_PREFIX}/admin/shops/${publicShopId}/commission-schedule`)
      .set('Idempotency-Key', randomUUID())
      .send(body);
  }

  /**
   * The canonical FX seam reads live rates from `exchange_rates`; a scenario that
   * prices in one currency and settles in another seeds both directions.
   */
  async function seedExchangeRate(fromCurrency: string, toCurrency: string, rate: string) {
    await sql.query(
      `insert into "exchange_rates"
         ("id", "created_at", "updated_at", "from_currency", "to_currency", "rate", "effective_at", "expires_at", "source", "source_timestamp")
       values ($1, now(), now(), $2, $3, $4, now() - interval '1 day', null, 'test-rates', now() - interval '1 day')`,
      [randomUUID(), fromCurrency, toCurrency, rate],
    );
  }

  /**
   * The buyer's saved market preference is authoritative over request headers, so
   * a buyer who pays in another currency is set up through the public profile
   * endpoint rather than through a header.
   */
  async function setBuyerMarket(
    target: TestBuyer,
    preferences: { region: string, language: string, currency: string },
  ): Promise<void> {
    await target.agent
      .patch(`${API_PREFIX}/me`)
      .set('Idempotency-Key', randomUUID())
      .send({ preferences })
      .expect(200);
  }

  async function readJournalEntry(moneyEventKey: string): Promise<{
    currency: string;
    charge_currency: string | null;
    charge_amount_minor: number | null;
    fx_rate: string | null;
  } | undefined> {
    const result = await sql.query(
      `select "currency", "charge_currency", "charge_amount_minor", "fx_rate"
       from "journal_entries"
       where "money_event_key" = $1`,
      [moneyEventKey],
    );

    return result.rows[0];
  }

  async function countCommissionSchedules(internalShopId: string): Promise<number> {
    const result = await sql.query(
      'select count(*)::int as "count" from "commission_schedules" where "shop_id" = $1',
      [internalShopId],
    );

    return result.rows[0].count as number;
  }

  async function countJournalEntries(moneyEventKey: string): Promise<number> {
    const result = await sql.query(
      'select count(*)::int as "count" from "journal_entries" where "money_event_key" = $1',
      [moneyEventKey],
    );

    return result.rows[0].count as number;
  }

  async function sumPostingsForEntry(moneyEventKey: string): Promise<number> {
    const result = await sql.query(
      `select coalesce(sum(p."amount_minor"), 0)::int as "total"
       from "postings" p
       join "journal_entries" je on je."id" = p."journal_entry_id"
       where je."money_event_key" = $1`,
      [moneyEventKey],
    );

    return result.rows[0].total as number;
  }

  async function sumPostingsByKindForEntry(
    moneyEventKey: string,
    kind: string,
  ): Promise<number> {
    const result = await sql.query(
      `select coalesce(sum(p."amount_minor"), 0)::int as "total"
       from "postings" p
       join "journal_entries" je on je."id" = p."journal_entry_id"
       join "ledger_accounts" la on la."id" = p."ledger_account_id"
       where je."money_event_key" = $1 and la."kind" = $2`,
      [moneyEventKey, kind],
    );

    return result.rows[0].total as number;
  }

  async function countPostingsByKindForEntry(
    moneyEventKey: string,
    kind: string,
  ): Promise<number> {
    const result = await sql.query(
      `select count(*)::int as "count"
       from "postings" p
       join "journal_entries" je on je."id" = p."journal_entry_id"
       join "ledger_accounts" la on la."id" = p."ledger_account_id"
       where je."money_event_key" = $1 and la."kind" = $2`,
      [moneyEventKey, kind],
    );

    return result.rows[0].count as number;
  }

  async function readPayablePosition(
    internalShopId: string,
  ): Promise<PayablePosition | undefined> {
    const result = await sql.query(
      `select "currency", "available_minor", "not_yet_available_minor"
       from "seller_payable_positions"
       where "shop_id" = $1`,
      [internalShopId],
    );

    return result.rows[0] as PayablePosition | undefined;
  }

  async function readPayable(
    owner: TestSeller,
    publicShopId: string,
  ): Promise<PayableResponse> {
    const response = await owner.agent
      .get(`${API_PREFIX}/shops/${publicShopId}/finance/payable`)
      .expect(200);

    return response.body as PayableResponse;
  }

  async function readPostingsSnapshot(moneyEventKey: string): Promise<unknown[]> {
    const result = await sql.query(
      `select p."amount_minor", la."kind", la."currency"
       from "postings" p
       join "journal_entries" je on je."id" = p."journal_entry_id"
       join "ledger_accounts" la on la."id" = p."ledger_account_id"
       where je."money_event_key" = $1
       order by la."kind"`,
      [moneyEventKey],
    );

    return result.rows;
  }

  it('An admin records a Commission Schedule and replaces it at the same instant', async () => {
    const first = await putCommissionSchedule(seller.shopPublicId, {
      effective_from: SCHEDULE_EFFECTIVE_FROM,
      rate_basis_points: 1500,
    });
    expect(first.status).toBe(200);

    const firstBody: CommissionScheduleResponse = first.body;
    expect(firstBody.rate_basis_points).toBe(1500);
    expect(new Date(firstBody.effective_from).toISOString()).toBe(SCHEDULE_EFFECTIVE_FROM);
    expect(typeof firstBody.shop_id).toBe('string');
    expect(firstBody.shop_id).toBe(seller.shopPublicId);

    // One row per effective-from instant: re-recording the same instant is a
    // replace, not a second row.
    expect(await countCommissionSchedules(shopInternalId)).toBe(1);

    const second = await putCommissionSchedule(seller.shopPublicId, {
      effective_from: SCHEDULE_EFFECTIVE_FROM,
      rate_basis_points: 500,
    });
    expect(second.status).toBe(200);
    const secondBody: CommissionScheduleResponse = second.body;
    expect(secondBody.rate_basis_points).toBe(500);

    expect(await countCommissionSchedules(shopInternalId)).toBe(1);
    const stored = await sql.query(
      'select "rate_basis_points" from "commission_schedules" where "shop_id" = $1',
      [shopInternalId],
    );
    expect(stored.rows[0].rate_basis_points).toBe(500);

    // Restore the 1500 bps schedule the commission scenario relies on.
    const restored = await putCommissionSchedule(seller.shopPublicId, {
      effective_from: SCHEDULE_EFFECTIVE_FROM,
      rate_basis_points: 1500,
    });
    expect(restored.status).toBe(200);
    expect(await countCommissionSchedules(shopInternalId)).toBe(1);
  });

  it('A schedule without an effective date or with an invalid rate is refused', async () => {
    const before = await countCommissionSchedules(shopInternalId);

    const missingDate = await putCommissionSchedule(seller.shopPublicId, {
      rate_basis_points: 1500,
    });
    expect(missingDate.status).toBe(400);

    const invalidRate = await putCommissionSchedule(seller.shopPublicId, {
      effective_from: SCHEDULE_EFFECTIVE_FROM,
      rate_basis_points: 20_000,
    });
    expect(invalidRate.status).toBe(400);
    const invalidRateError: { code: string } = invalidRate.body;
    expect(invalidRateError.code).toBe('INVALID_COMMISSION_RATE');

    expect(await countCommissionSchedules(shopInternalId)).toBe(before);
  });

  it('A non-admin cannot record a Commission Schedule', async () => {
    const asSeller = await seller.agent
      .put(`${API_PREFIX}/admin/shops/${seller.shopPublicId}/commission-schedule`)
      .set('Idempotency-Key', randomUUID())
      .send({ effective_from: SCHEDULE_EFFECTIVE_FROM, rate_basis_points: 999 });

    expect(asSeller.status).toBe(403);

    const anonymous = await request(app.getHttpServer())
      .put(`${API_PREFIX}/admin/shops/${seller.shopPublicId}/commission-schedule`)
      .send({ effective_from: SCHEDULE_EFFECTIVE_FROM, rate_basis_points: 999 });

    expect(anonymous.status).toBe(401);

    // Neither refused call recorded anything.
    expect(await countCommissionSchedules(shopInternalId)).toBe(1);
  });

  it('Commission is charged on the discounted item subtotal only', async () => {
    firstPaidOrder = await placeAndPayCardOrder(buyer, inventoryId, 1);

    const orderRow = await readOrderMoneyRow(firstPaidOrder.orderPublicId);
    const discountedSubtotal = orderRow.subtotal_minor - orderRow.discount_minor;
    const commissionMinor = expectedCommissionMinor(discountedSubtotal, 1500);
    const netMinor = orderRow.subtotal_minor - orderRow.discount_minor + orderRow.shipping_minor - commissionMinor;

    expect(commissionMinor).toBeGreaterThan(0);

    // Exactly one balanced Journal Entry for the Order's money event.
    expect(await countJournalEntries(firstPaidOrder.moneyEventKey)).toBe(1);
    expect(await sumPostingsForEntry(firstPaidOrder.moneyEventKey)).toBe(0);

    // Platform Commission is the discounted-subtotal share, not the whole Order.
    expect(await sumPostingsByKindForEntry(firstPaidOrder.moneyEventKey, 'platform_commission'))
      .toBe(commissionMinor);
    expect(commissionMinor).toBeLessThan(orderRow.total_minor);

    // Seller Payable posting is the net: full collected minus commission.
    expect(await sumPostingsByKindForEntry(firstPaidOrder.moneyEventKey, 'seller_payable'))
      .toBe(netMinor);

    // The shop's position carries that net, not the undiminished collected total.
    const position = await readPayablePosition(shopInternalId);
    expect(position?.not_yet_available_minor).toBe(netMinor);

    firstOrderPostingsSnapshot = await readPostingsSnapshot(firstPaidOrder.moneyEventKey);
  });

  it('The owning seller sees the net payable; another seller cannot', async () => {
    const orderRow = await readOrderMoneyRow(firstPaidOrder.orderPublicId);
    const expectedNet = orderRow.subtotal_minor - orderRow.discount_minor + orderRow.shipping_minor -
      expectedCommissionMinor(orderRow.subtotal_minor - orderRow.discount_minor, 1500);

    const payable = await readPayable(seller, seller.shopPublicId);
    expect(payable.not_yet_available_minor).toBe(expectedNet);

    await unrelatedSeller.agent
      .get(`${API_PREFIX}/shops/${seller.shopPublicId}/finance/payable`)
      .expect(403);
  });

  it('Replacing a schedule leaves an already-posted Order untouched', async () => {
    const replaced = await putCommissionSchedule(seller.shopPublicId, {
      effective_from: SCHEDULE_EFFECTIVE_FROM,
      rate_basis_points: 500,
    });
    expect(replaced.status).toBe(200);

    // The first Order's frozen postings and the shop's position are unchanged.
    const postingsAfter = await readPostingsSnapshot(firstPaidOrder.moneyEventKey);
    expect(postingsAfter).toEqual(firstOrderPostingsSnapshot);

    const orderRow = await readOrderMoneyRow(firstPaidOrder.orderPublicId);
    const positionAfter = await readPayablePosition(shopInternalId);
    const firstNet = orderRow.subtotal_minor - orderRow.discount_minor + orderRow.shipping_minor -
      expectedCommissionMinor(orderRow.subtotal_minor - orderRow.discount_minor, 1500);
    expect(positionAfter?.not_yet_available_minor).toBe(firstNet);

    // A second Order is charged at the new 500 bps rate.
    const secondOrder = await placeAndPayCardOrder(buyer, inventoryId, 1);
    const secondRow = await readOrderMoneyRow(secondOrder.orderPublicId);
    const secondCommission = expectedCommissionMinor(
      secondRow.subtotal_minor - secondRow.discount_minor,
      500,
    );
    expect(secondCommission).not.toBe(expectedCommissionMinor(
      secondRow.subtotal_minor - secondRow.discount_minor,
      1500,
    ));
    expect(await sumPostingsByKindForEntry(secondOrder.moneyEventKey, 'platform_commission'))
      .toBe(secondCommission);
  });

  it('An Order posted before a future schedule uses the previous schedule', async () => {
    const future = await putCommissionSchedule(seller.shopPublicId, {
      effective_from: FUTURE_EFFECTIVE_FROM,
      rate_basis_points: 9000,
    });
    expect(future.status).toBe(200);

    const thirdOrder = await placeAndPayCardOrder(buyer, inventoryId, 1);
    const thirdRow = await readOrderMoneyRow(thirdOrder.orderPublicId);

    // The later schedule is not yet in force, so 500 bps still applies.
    const atFiveHundred = expectedCommissionMinor(
      thirdRow.subtotal_minor - thirdRow.discount_minor,
      500,
    );
    const atNineThousand = expectedCommissionMinor(
      thirdRow.subtotal_minor - thirdRow.discount_minor,
      9000,
    );
    expect(atFiveHundred).not.toBe(atNineThousand);

    expect(await sumPostingsByKindForEntry(thirdOrder.moneyEventKey, 'platform_commission'))
      .toBe(atFiveHundred);

    const singleShopSchedules = await sql.query(
      'select count(*)::int as "count" from "commission_schedules" where "shop_id" = $1',
      [shopInternalId],
    );
    expect(singleShopSchedules.rows[0].count).toBe(2);
  });

  it('No schedule means no commission', async () => {
    const plainSeller = await registerSeller('fin-plain');
    const plainProfile = await createActiveProfile(plainSeller);
    const plainProduct = await createPublishableProduct({
      seller: plainSeller,
      shippingProfileId: plainProfile.id,
      title: 'No Schedule Mug',
      sku: `FIN-NO-SCHEDULE-${randomUUID()}`,
      amountMinor: 2500,
      stock: 10,
    });
    const plainShopInternalId = await resolveShopId(sql, plainSeller.shopPublicId);

    expect(await countCommissionSchedules(plainShopInternalId)).toBe(0);

    const plainBuyer = await registerBuyer('fin-plain-buyer');
    const paidOrder = await placeAndPayCardOrder(plainBuyer, plainProduct.inventoryId, 1);
    const orderRow = await readOrderMoneyRow(paidOrder.orderPublicId);

    const fullCollect = orderRow.subtotal_minor - orderRow.discount_minor + orderRow.shipping_minor;

    expect(await countPostingsByKindForEntry(paidOrder.moneyEventKey, 'platform_commission'))
      .toBe(0);
    expect(await sumPostingsByKindForEntry(paidOrder.moneyEventKey, 'seller_payable'))
      .toBe(fullCollect);

    const position = await readPayablePosition(plainShopInternalId);
    expect(position?.not_yet_available_minor).toBe(fullCollect);
  });

  it('Commission is charged on the converted discounted subtotal when the buyer pays in another currency', async () => {
    // The shop prices in USD and this buyer pays in VND, so the base the rate
    // applies to is the converted one, not the charge-currency amount.
    await seedExchangeRate('USD', 'VND', '25000');
    await seedExchangeRate('VND', 'USD', '0.00004');

    const fxSeller = await registerSeller('fin-commission-fx');
    const fxProfile = await createActiveProfile(fxSeller);
    const fxProduct = await createPublishableProduct({
      seller: fxSeller,
      shippingProfileId: fxProfile.id,
      title: 'Converted Commission Mug',
      sku: `FIN-COMMISSION-FX-${randomUUID()}`,
      amountMinor: 1000,
      stock: 5,
    });
    const fxShopInternalId = await resolveShopId(sql, fxSeller.shopPublicId);

    const schedule = await putCommissionSchedule(fxSeller.shopPublicId, {
      effective_from: SCHEDULE_EFFECTIVE_FROM,
      rate_basis_points: 1500,
    });
    expect(schedule.status).toBe(200);

    const fxBuyer = await registerBuyer('fin-commission-fx-buyer');
    await setBuyerMarket(fxBuyer, { region: 'Vietnam', language: 'la', currency: 'VND' });

    await addCartItem(fxBuyer, fxProduct.inventoryId, 1);
    const quote = await createQuote(fxBuyer);
    expect(quote.checkout_currency).toBe('VND');

    const orderResponse = await confirmCardOrder(fxBuyer, quote.quote_id);
    expect(orderResponse.status).toBe(201);

    const orderPublicId = orderResponse.body.order_shops[0].id as string;
    const checkoutSessionId = await readOrderSessionId(orderPublicId);
    await completeCardSession(checkoutSessionId);
    await pumpFinance();

    const orderRow = await readOrderMoneyRow(orderPublicId);
    const moneyEventKey = `order.paid:${orderRow.id}`;

    // The entry settles in the shop's currency and keeps what the buyer paid.
    const entry = await readJournalEntry(moneyEventKey);
    expect(entry).toMatchObject({
      currency: 'USD',
      charge_currency: 'VND',
      charge_amount_minor: orderRow.total_minor,
      fx_rate: '0.0000400000',
    });

    // 250000 VND of goods converts to exactly 1000 USD minor; 15.00% of that is
    // the commission, and the converted shipping charge passes through in full.
    expect(await sumPostingsByKindForEntry(moneyEventKey, 'platform_commission')).toBe(150);
    expect(await sumPostingsByKindForEntry(moneyEventKey, 'seller_payable')).toBe(1449);
    expect(await sumPostingsForEntry(moneyEventKey)).toBe(0);

    const position = await readPayablePosition(fxShopInternalId);
    expect(position).toMatchObject({ currency: 'USD', not_yet_available_minor: 1449 });
  });

  it('The seller Order detail exposes the Platform Commission frozen in the ledger', async () => {
    const detailSeller = await registerSeller('fin-detail-commission');
    const detailProfile = await createActiveProfile(detailSeller);
    const detailProduct = await createPublishableProduct({
      seller: detailSeller,
      shippingProfileId: detailProfile.id,
      title: 'Ledger Detail Mug',
      sku: `FIN-DETAIL-COMMISSION-${randomUUID()}`,
      amountMinor: 2500,
      stock: 10,
    });

    const schedule = await putCommissionSchedule(detailSeller.shopPublicId, {
      effective_from: SCHEDULE_EFFECTIVE_FROM,
      rate_basis_points: 1500,
    });
    expect(schedule.status).toBe(200);

    const detailBuyer = await registerBuyer('fin-detail-commission-buyer');
    const paidOrder = await placeAndPayCardOrder(detailBuyer, detailProduct.inventoryId, 1);
    const ledgerCommission = await sumPostingsByKindForEntry(
      paidOrder.moneyEventKey,
      'platform_commission',
    );
    expect(ledgerCommission).toBeGreaterThan(0);

    // The detail response reports the frozen `platform_commission` posting, not
    // a recomputation from the current schedule.
    const paidDetail = await detailSeller.agent
      .get(`${API_PREFIX}/shops/${detailSeller.shopPublicId}/orders/${paidOrder.orderPublicId}`)
      .expect(200);
    expect(paidDetail.body.order.platform_commission_minor).toBe(ledgerCommission);

    // A card Order that has not been paid has no `order.paid` entry, so the
    // detail response reports null rather than zero.
    await addCartItem(detailBuyer, detailProduct.inventoryId, 1);
    const unpaidQuote = await createQuote(detailBuyer);
    const unpaidOrder = await confirmCardOrder(detailBuyer, unpaidQuote.quote_id);
    expect(unpaidOrder.status).toBe(201);
    const unpaidOrderPublicId = unpaidOrder.body.order_shops[0].id as string;

    const unpaidDetail = await detailSeller.agent
      .get(`${API_PREFIX}/shops/${detailSeller.shopPublicId}/orders/${unpaidOrderPublicId}`)
      .expect(200);
    expect(unpaidDetail.body.order.platform_commission_minor).toBeNull();
  });
});
