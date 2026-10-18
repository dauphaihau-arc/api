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

type TestDatabase = TestDatabaseContext;

type TestSeller = {
  agent: Agent; email: string; shopId: string; shopPublicId: string;
};
type TestBuyer = {
  agent: Agent; email: string; userId: string; addressId: string;
};

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

type PayableResponse = { positions: PayablePosition[] };

type PaidOrder = {
  orderInternalId: string;
  orderPublicId: string;
  checkoutSessionId: string;
  currency: string;
  creditMinor: number;
  moneyEventKey: string;
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

  async createRefund(): Promise<{ id: string; status: string; amount: number }> {
    return { id: 're_test', status: 'succeeded', amount: 0 };
  }
}

// eslint-disable-next-line max-lines-per-function
describe('Seller Payable from a paid Order (integration)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: TestDatabase;
  let storageRoot: string;
  let sql: Client;
  let gateway: FakePaymentGateway;
  let categoryId: string | undefined;

  let seller: TestSeller;
  let unrelatedSeller: TestSeller;
  let buyer: TestBuyer;
  let inventoryId: string;
  let shopInternalId: string;
  let firstPaidOrder: PaidOrder;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase('finance_seller_payable');
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-finance-int-'));
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

    seller = await registerSeller('fin-owner');
    shopInternalId = await resolveShopId(sql, seller.shopPublicId);
    unrelatedSeller = await registerSeller('fin-other');
    const profile = await createActiveProfile(seller);
    const product = await createPublishableProduct({
      seller,
      shippingProfileId: profile.id,
      title: 'Ledger Mug',
      sku: `FIN-LEDGER-${randomUUID()}`,
      amountMinor: 2500,
      stock: 25,
    });
    inventoryId = product.inventoryId;
    buyer = await registerBuyer('fin-buyer');

    // The tracer's single flow: one card Order paid through the real webhook,
    // then the shared outbox pumped by the Finance processor inline.
    firstPaidOrder = await placeAndPayCardOrder(1);
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

  async function registerSeller(prefix: string): Promise<TestSeller> {
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
        shop_name: `fin${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`,
        currency: 'USD',
      })
      .expect(201);

    return {
      agent,
      email,
      shopId: shopResponse.body.id as string,
      shopPublicId: shopResponse.body.id as string,
    };
  }

  async function registerBuyer(prefix: string): Promise<TestBuyer> {
    const agent = request.agent(app.getHttpServer());
    const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.com`;

    const registerResponse = await agent
      .post(`${API_PREFIX}/auth/register`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', `203.0.113.${Math.floor(Math.random() * 200) + 1}`)
      .send({ email, password: VALID_TEST_PASSWORD, displayName: 'Buyer' })
      .expect(201);

    const addressResponse = await agent
      .post(`${API_PREFIX}/me/addresses`)
      .set('Idempotency-Key', randomUUID())
      .send({
        full_name: 'Finance Buyer',
        address_1: '123 Main St',
        city: 'Los Angeles',
        state: 'CA',
        zip: '90001',
        country: 'US',
        phone: '123456789',
        is_primary: true,
      })
      .expect(201);

    return {
      agent,
      email,
      userId: registerResponse.body.user.id as string,
      addressId: addressResponse.body.address.id as string,
    };
  }

  async function seedCategory(agent: Agent): Promise<string> {
    if (categoryId) {
      return categoryId;
    }

    const response = await agent
      .post(`${API_PREFIX}/categories`)
      .set('Idempotency-Key', randomUUID())
      .send({ name: 'Finance ledger', rank: 1 })
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
        description: 'Finance ledger product',
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

  async function createQuote(
    target: TestBuyer,
    shopAdjustments?: Array<{ shop_id: string; promo_codes: string[] }>,
  ): Promise<ShippingQuoteResponse> {
    const response = await target.agent
      .post(`${API_PREFIX}/me/checkout/quote`)
      .set('Idempotency-Key', randomUUID())
      .send({
        user_address_id: target.addressId,
        ...(shopAdjustments ? { addition_info_shop_carts: shopAdjustments } : {}),
      });

    expect(response.body).toMatchObject({
      quote_id: expect.any(String),
      checkout_currency: expect.any(String),
      total_minor: expect.any(Number),
      shops: expect.any(Array),
    });

    return response.body as ShippingQuoteResponse;
  }

  async function createShopPromoCode(
    owner: TestSeller,
    body: Record<string, unknown>,
  ): Promise<void> {
    await owner.agent
      .post(`${API_PREFIX}/shops/${owner.shopPublicId}/promo-codes`)
      .set('Idempotency-Key', randomUUID())
      .send(body)
      .expect(201);
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

  async function expireCardSession(sessionId: string): Promise<void> {
    gateway.queueEvent({
      id: `evt_${randomUUID()}`,
      type: 'checkout.session.expired',
      data: { object: { id: sessionId, status: 'expired' } },
    });

    await request(app.getHttpServer())
      .post(`${API_PREFIX}/webhooks/stripe`)
      .send({ type: 'checkout.session.expired' })
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
  async function placeAndPayCardOrder(quantity: number): Promise<PaidOrder> {
    await addCartItem(buyer, inventoryId, quantity);
    const quote = await createQuote(buyer);
    const orderResponse = await confirmCardOrder(buyer, quote.quote_id);
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
      checkoutSessionId,
      currency: row.currency,
      creditMinor,
      moneyEventKey: `order.paid:${row.id}`,
    };
  }

  async function countJournalEntries(moneyEventKey: string): Promise<number> {
    const result = await sql.query(
      'select count(*)::int as "count" from "journal_entries" where "money_event_key" = $1',
      [moneyEventKey],
    );

    return result.rows[0].count as number;
  }

  async function countPostingsForEntry(moneyEventKey: string): Promise<number> {
    const result = await sql.query(
      `select count(*)::int as "count"
       from "postings" p
       join "journal_entries" je on je."id" = p."journal_entry_id"
       where je."money_event_key" = $1`,
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

  async function sumSellerPayablePostingsForEntry(moneyEventKey: string): Promise<number> {
    const result = await sql.query(
      `select coalesce(sum(p."amount_minor"), 0)::int as "total"
       from "postings" p
       join "journal_entries" je on je."id" = p."journal_entry_id"
       join "ledger_accounts" la on la."id" = p."ledger_account_id"
       where je."money_event_key" = $1 and la."kind" = 'seller_payable'`,
      [moneyEventKey],
    );

    return result.rows[0].total as number;
  }

  async function sumSellerPayablePostingsForShop(
    internalShopId: string,
    currency: string,
  ): Promise<number> {
    const result = await sql.query(
      `select coalesce(sum(p."amount_minor"), 0)::int as "total"
       from "postings" p
       join "ledger_accounts" la on la."id" = p."ledger_account_id"
       where la."kind" = 'seller_payable'
         and la."shop_id" = $1
         and la."currency" = $2`,
      [internalShopId, currency],
    );

    return result.rows[0].total as number;
  }

  async function readPayablePosition(
    internalShopId: string,
    currency: string,
  ): Promise<PayablePosition | undefined> {
    const result = await sql.query(
      `select "currency", "available_minor", "not_yet_available_minor"
       from "seller_payable_positions"
       where "shop_id" = $1 and "currency" = $2`,
      [internalShopId, currency],
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

  it('A paid Order credits Seller Payable once', async () => {
    const order = firstPaidOrder;

    // The frozen money facts the paid Order carried into the ledger.
    const orderRow = await readOrderMoneyRow(order.orderPublicId);
    expect(order.creditMinor).toBe(orderRow.total_minor);

    // Exactly one Journal Entry, identified by the money event.
    expect(await countJournalEntries(order.moneyEventKey)).toBe(1);

    // Its two Postings balance to zero in USD.
    expect(await countPostingsForEntry(order.moneyEventKey)).toBe(2);
    expect(await sumPostingsForEntry(order.moneyEventKey)).toBe(0);

    // The credit to the shop's seller_payable account equals the Order's money.
    expect(await sumSellerPayablePostingsForEntry(order.moneyEventKey)).toBe(order.creditMinor);

    // The shop's Seller Payable position projected that same credit.
    const position = await readPayablePosition(shopInternalId, order.currency);
    expect(position).toMatchObject({
      currency: 'USD',
      available_minor: 0,
      not_yet_available_minor: order.creditMinor,
    });
  });

  it('The shop-scoped endpoint returns the credited Seller Payable', async () => {
    const order = firstPaidOrder;
    const payable = await readPayable(seller, seller.shopPublicId);

    expect(payable.positions).toHaveLength(1);
    const position = payable.positions[0]!;

    expect(position.currency).toBe(order.currency);
    expect(position.available_minor).toBe(0);
    expect(position.not_yet_available_minor).toBe(order.creditMinor);

    // Integer minor units only: no major-unit or decimal field crosses the contract.
    expect(Object.keys(payable).sort()).toEqual(['positions']);
    expect(Object.keys(position).sort()).toEqual([
      'available_minor',
      'currency',
      'not_yet_available_minor',
    ]);
    expect(Number.isInteger(position.available_minor)).toBe(true);
    expect(Number.isInteger(position.not_yet_available_minor)).toBe(true);
    expect(JSON.stringify(payable)).not.toContain('_major');
  });

  it('Seller Payable equals the sum of its Postings after a second Order', async () => {
    const secondOrder = await placeAndPayCardOrder(2);
    expect(secondOrder.currency).toBe(firstPaidOrder.currency);

    const position = await readPayablePosition(shopInternalId, firstPaidOrder.currency);
    expect(position).toBeDefined();

    const postingsSum = await sumSellerPayablePostingsForShop(
      shopInternalId,
      firstPaidOrder.currency,
    );

    expect(postingsSum).toBe(firstPaidOrder.creditMinor + secondOrder.creditMinor);
    expect(position!.not_yet_available_minor).toBe(postingsSum);

    const payable = await readPayable(seller, seller.shopPublicId);
    expect(payable.positions).toHaveLength(1);
    expect(payable.positions[0]!.not_yet_available_minor).toBe(postingsSum);
  });

  it('Replay is a no-op', async () => {
    const order = firstPaidOrder;
    const before = await readPayablePosition(shopInternalId, order.currency);

    const reset = await sql.query(
      `update "outbox_events"
       set "status" = 'pending', "available_at" = now() - interval '1 minute',
           "attempt_count" = 0, "processed_at" = null, "last_error" = null
       where "event_name" = 'order.paid' and "aggregate_id" = $1
       returning "id"`,
      [order.orderInternalId],
    );

    expect(reset.rowCount).toBe(1);

    const processed = await pumpFinance();
    expect(processed).toBeGreaterThan(0);

    expect(await countJournalEntries(order.moneyEventKey)).toBe(1);
    expect(await countPostingsForEntry(order.moneyEventKey)).toBe(2);
    expect(await sumPostingsForEntry(order.moneyEventKey)).toBe(0);

    const after = await readPayablePosition(shopInternalId, order.currency);
    expect(after).toEqual(before);
  });

  it('An expired checkout session produces no Journal Entry', async () => {
    const before = await readPayablePosition(shopInternalId, firstPaidOrder.currency);

    await addCartItem(buyer, inventoryId, 1);
    const quote = await createQuote(buyer);
    const orderResponse = await confirmCardOrder(buyer, quote.quote_id);
    expect(orderResponse.status).toBe(201);

    const orderPublicId = orderResponse.body.order_shops[0].id as string;
    const checkoutSessionId = await readOrderSessionId(orderPublicId);

    await expireCardSession(checkoutSessionId);
    await pumpFinance();

    const expiredRow = await readOrderMoneyRow(orderPublicId);
    const expiredKey = `order.paid:${expiredRow.id}`;

    expect(await countJournalEntries(expiredKey)).toBe(0);

    const after = await readPayablePosition(shopInternalId, firstPaidOrder.currency);
    expect(after).toEqual(before);
  });

  it('A caller who does not manage the shop cannot read it', async () => {
    await unrelatedSeller.agent
      .get(`${API_PREFIX}/shops/${seller.shopPublicId}/finance/payable`)
      .expect(403);

    const payable = await readPayable(seller, seller.shopPublicId);
    expect(payable.positions).toHaveLength(1);
  });

  it('a paid card Order credits Seller Payable with the discount subtracted', async () => {
    // A fresh shop, so its Seller Payable starts empty and the absolute
    // expectation below holds without borrowing the tracer's earlier Orders.
    const discountSeller = await registerSeller('fin-discount');
    const profile = await createActiveProfile(discountSeller);
    const product = await createPublishableProduct({
      seller: discountSeller,
      shippingProfileId: profile.id,
      title: 'Discount Ledger Mug',
      sku: `FIN-DISCOUNT-${randomUUID()}`,
      amountMinor: 10_000,
      stock: 10,
    });

    // The seller publishes a 10% code-only promo, which the buyer applies.
    await createShopPromoCode(discountSeller, {
      name: 'Ten percent off',
      code: 'FIN10',
      percent_off: 10,
      visibility: 'code_only',
      product_scope: 'all',
      timezone: 'UTC',
      start_now: true,
      end_local: new Date(Date.now() + (2 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 16),
    });

    const discountBuyer = await registerBuyer('fin-discount-buyer');
    await addCartItem(discountBuyer, product.inventoryId, 1);

    const applyResponse = await discountBuyer.agent
      .post(`${API_PREFIX}/cart/promo-codes/apply`)
      .set('Idempotency-Key', randomUUID())
      .send({ shop_id: discountSeller.shopPublicId, code: 'FIN10', promo_codes: [] })
      .expect(201);
    expect(applyResponse.body.promo_codes).toContain('FIN10');

    const quote = await createQuote(discountBuyer, [{
      shop_id: discountSeller.shopPublicId,
      promo_codes: applyResponse.body.promo_codes as string[],
    }]);

    const orderResponse = await confirmCardOrder(discountBuyer, quote.quote_id);
    expect(orderResponse.status).toBe(201);

    const orderPublicId = orderResponse.body.order_shops[0].id as string;
    const checkoutSessionId = await readOrderSessionId(orderPublicId);
    await completeCardSession(checkoutSessionId);
    await pumpFinance();

    const orderRow = await readOrderMoneyRow(orderPublicId);

    // The Order really carried both a discount and a shipping charge.
    expect(orderRow.discount_minor).toBeGreaterThan(0);
    expect(orderRow.shipping_minor).toBeGreaterThan(0);

    const payable = await readPayable(discountSeller, discountSeller.shopPublicId);
    expect(payable.positions).toHaveLength(1);

    const position = payable.positions[0]!;
    expect(position.currency).toBe(orderRow.currency);
    expect(position.available_minor).toBe(0);
    expect(position.not_yet_available_minor).toBe(
      orderRow.subtotal_minor - orderRow.discount_minor + orderRow.shipping_minor,
    );

    // Strictly below subtotal + shipping: the discount reduced the payable
    // rather than being ignored or double-counted.
    expect(position.not_yet_available_minor).toBeLessThan(
      orderRow.subtotal_minor + orderRow.shipping_minor,
    );
  });
});
