import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EntityManager, MikroORM } from '@mikro-orm/postgresql';
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
import { RecordPayoutAvailabilityUseCase } from '~/domains/finance/app/use-cases/record-payout-availability/record-payout-availability.use-case';
import type { OrderDeliveredEvent } from '~/domains/finance/app/ports/order-delivered-event';
import { MikroOrmJournalEntryRepository } from '~/domains/finance/infra/persistence/repositories/mikro-orm-journal-entry.repository';
import { MikroOrmOrderPaidEventRepository } from '~/domains/finance/infra/persistence/repositories/mikro-orm-order-paid-event.repository';
import { MikroOrmPayoutAvailabilityRepository } from '~/domains/finance/infra/persistence/repositories/mikro-orm-payout-availability.repository';
import { MikroOrmSellerPayableCommandRepository } from '~/domains/finance/infra/persistence/repositories/mikro-orm-seller-payable-command.repository';
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

type PayableResponse = PayablePosition;

type PaidOrder = {
  orderInternalId: string;
  orderPublicId: string;
  checkoutSessionId: string;
  currency: string;
  creditMinor: number;
  moneyEventKey: string;
};

type Shipment = { id: string };
type Group = { id: string; shipments: Shipment[] };
type Fulfillment = { progress: Record<string, number>; groups: Group[] };

type PayoutAvailabilityRow = {
  order_id: string;
  shop_id: string;
  currency: string;
  amount_minor: number;
  delivered_at: string;
  evidence: Array<{ shipmentId: string; shipmentPublicId: string; deliveredAt: string }>;
};

function randomForwardedIp() {
  return `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
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
 * row, the delivery outbox row, and Finance's ledger all move through the real
 * application.
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

// eslint-disable-next-line max-lines-per-function
describe('Payout Availability from delivery (integration)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: TestDatabase;
  let storageRoot: string;
  let sql: Client;
  let gateway: FakePaymentGateway;
  let categoryId: string | undefined;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase('finance_payout_availability');
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-payout-int-'));
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
      .set('X-Forwarded-For', randomForwardedIp())
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
        shop_name: `pay${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`,
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
      .set('X-Forwarded-For', randomForwardedIp())
      .send({ email, password: VALID_TEST_PASSWORD, displayName: 'Buyer' })
      .expect(201);

    const addressResponse = await agent
      .post(`${API_PREFIX}/me/addresses`)
      .set('Idempotency-Key', randomUUID())
      .send({
        full_name: 'Payout Buyer',
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
      .send({ name: 'Payout ledger', rank: 1 })
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
        description: 'Payout ledger product',
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
      shopId: input.seller.shopPublicId,
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

  /** One fresh shop with a single publishable, in-stock Product. */
  async function createShopWithProduct(
    prefix: string,
    options: { amountMinor: number; stock: number },
  ): Promise<{ seller: TestSeller; shopInternalId: string; inventoryId: string }> {
    const seller = await registerSeller(prefix);
    const shopInternalId = await resolveShopId(sql, seller.shopPublicId);
    const profile = await createActiveProfile(seller);
    const product = await createPublishableProduct({
      seller,
      shippingProfileId: profile.id,
      title: `${prefix} mug`,
      sku: `${prefix.toUpperCase()}-${randomUUID()}`,
      amountMinor: options.amountMinor,
      stock: options.stock,
    });

    return { seller, shopInternalId, inventoryId: product.inventoryId };
  }

  async function addCartItem(
    target: TestBuyer,
    targetInventoryId: string,
    quantity: number,
  ): Promise<void> {
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

  async function confirmOrder(
    target: TestBuyer,
    quoteId: string,
    paymentType: 'card' | 'cash',
  ) {
    return target.agent
      .post(`${API_PREFIX}/me/checkout`)
      .set('Idempotency-Key', randomUUID())
      .send({ quote_id: quoteId, payment_type: paymentType });
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
   * webhook, then pumps the Finance side so its Seller Payable is recorded as
   * not-yet-available. Returns the frozen money facts.
   */
  async function placeAndPayCardOrder(
    target: TestBuyer,
    targetInventoryId: string,
    quantity: number,
  ): Promise<PaidOrder> {
    await addCartItem(target, targetInventoryId, quantity);
    const quote = await createQuote(target);
    const orderResponse = await confirmOrder(target, quote.quote_id, 'card');
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

  async function readOrderItemId(orderInternalId: string): Promise<string> {
    const result = await sql.query(
      'select "id" from "order_items" where "order_id" = $1 limit 1',
      [orderInternalId],
    );

    const id = result.rows[0]?.id as string | undefined;

    if (!id) {
      throw new Error(`Order ${orderInternalId} has no order_item`);
    }

    return id;
  }

  function prepareShipment(
    owner: TestSeller,
    orderPublicId: string,
    body: Record<string, unknown>,
  ) {
    return owner.agent
      .post(`${API_PREFIX}/shops/${owner.shopPublicId}/orders/${orderPublicId}/fulfillment/shipments`)
      .set('Idempotency-Key', randomUUID())
      .send(body);
  }

  function journey(
    owner: TestSeller,
    orderPublicId: string,
    shipmentId: string,
    status: string,
    idempotencyKey: string = randomUUID(),
  ) {
    return owner.agent
      .post(`${API_PREFIX}/shops/${owner.shopPublicId}/orders/${orderPublicId}/fulfillment/shipments/${shipmentId}/journey`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ status });
  }

  function cancelOrder(owner: TestSeller, orderPublicId: string, reason: string) {
    return owner.agent
      .patch(`${API_PREFIX}/shops/${owner.shopPublicId}/orders/${orderPublicId}/status`)
      .send({ status: 'canceled', cancel_reason: reason });
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

  async function readPayable(owner: TestSeller, publicShopId: string): Promise<PayableResponse> {
    const response = await owner.agent
      .get(`${API_PREFIX}/shops/${publicShopId}/finance/payable`)
      .expect(200);

    return response.body as PayableResponse;
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

  async function readPayoutAvailabilityRows(
    orderInternalId: string,
  ): Promise<PayoutAvailabilityRow[]> {
    const result = await sql.query(
      `select "order_id", "shop_id", "currency", "amount_minor", "delivered_at", "evidence"
       from "payout_availabilities" where "order_id" = $1`,
      [orderInternalId],
    );

    return result.rows as PayoutAvailabilityRow[];
  }

  async function countPayoutAvailabilityRows(orderInternalId: string): Promise<number> {
    const result = await sql.query(
      'select count(*)::int as "count" from "payout_availabilities" where "order_id" = $1',
      [orderInternalId],
    );

    return result.rows[0].count as number;
  }

  async function readDeliveredOutboxRows(
    orderInternalId: string,
  ): Promise<Array<{ id: string; status: string; payload: unknown }>> {
    const result = await sql.query(
      `select "id", "status", "payload"
       from "outbox_events"
       where "event_name" = 'order.delivered' and "aggregate_id" = $1
       order by "created_at" asc`,
      [orderInternalId],
    );

    return result.rows as Array<{ id: string; status: string; payload: unknown }>;
  }

  async function readPaidOutboxRows(
    orderInternalId: string,
  ): Promise<Array<{ id: string; status: string }>> {
    const result = await sql.query(
      `select "id", "status"
       from "outbox_events"
       where "event_name" = 'order.paid' and "aggregate_id" = $1
       order by "created_at" asc`,
      [orderInternalId],
    );

    return result.rows as Array<{ id: string; status: string }>;
  }

  it('1. Delivery makes exactly the delivered Order\'s amount available', async () => {
    const { seller, shopInternalId, inventoryId } = await createShopWithProduct('pay-full', {
      amountMinor: 4000,
      stock: 5,
    });
    const buyer = await registerBuyer('pay-full-buyer');
    const order = await placeAndPayCardOrder(buyer, inventoryId, 1);

    // The Seller Payable posting for this Order is the amount that must move.
    const payableAmount = await sumSellerPayablePostingsForEntry(order.moneyEventKey);
    expect(payableAmount).toBe(order.creditMinor);

    // Before delivery the whole credit sits not-yet-available.
    const before = await readPayablePosition(shopInternalId);
    expect(before).toMatchObject({ available_minor: 0, not_yet_available_minor: order.creditMinor });

    const prepared = await prepareShipment(seller, order.orderPublicId, {
      items: [{ order_item_id: await readOrderItemId(order.orderInternalId), quantity: 1 }],
      carrier: 'USPS',
      tracking_number: 'FULL-1',
    }).expect(201);
    const shipmentId = (prepared.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!.id;

    await journey(seller, order.orderPublicId, shipmentId, 'dispatched').expect(201);
    await journey(seller, order.orderPublicId, shipmentId, 'delivered').expect(201);

    const processed = await pumpFinance();
    expect(processed).toBeGreaterThan(0);

    // The entire Order credit is now available; nothing remains held back.
    const position = await readPayablePosition(shopInternalId);
    expect(position).toMatchObject({
      currency: order.currency,
      available_minor: order.creditMinor,
      not_yet_available_minor: 0,
    });
    expect(position!.available_minor).toBe(payableAmount);

    // Exactly one availability record for this Order, carrying the shipment evidence.
    const rows = await readPayoutAvailabilityRows(order.orderInternalId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      order_id: order.orderInternalId,
      shop_id: shopInternalId,
      currency: order.currency,
      amount_minor: order.creditMinor,
    });
    expect(rows[0]!.evidence).toHaveLength(1);
    expect(rows[0]!.evidence[0]!.shipmentPublicId).toBe(shipmentId);
    expect(rows[0]!.evidence[0]!.shipmentId).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(rows[0]!.evidence[0]!.deliveredAt))).toBe(false);

    // The shop-scoped endpoint agrees.
    const payable = await readPayable(seller, seller.shopPublicId);
    expect(payable).toMatchObject({
      currency: order.currency,
      available_minor: order.creditMinor,
      not_yet_available_minor: 0,
    });
  });

  it('2. Partial delivery makes nothing available until every required unit is delivered', async () => {
    const { seller, shopInternalId, inventoryId } = await createShopWithProduct('pay-partial', {
      amountMinor: 3000,
      stock: 6,
    });
    const buyer = await registerBuyer('pay-partial-buyer');
    const order = await placeAndPayCardOrder(buyer, inventoryId, 3);

    const orderItemId = await readOrderItemId(order.orderInternalId);

    const first = await prepareShipment(seller, order.orderPublicId, {
      items: [{ order_item_id: orderItemId, quantity: 1 }],
      carrier: 'USPS',
      tracking_number: 'PART-1',
    }).expect(201);
    const firstShipmentId = (first.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!.id;

    const second = await prepareShipment(seller, order.orderPublicId, {
      items: [{ order_item_id: orderItemId, quantity: 2 }],
      carrier: 'DHL',
      tracking_number: 'PART-2',
    }).expect(201);
    const secondShipmentId = (second.body.fulfillment as Fulfillment).groups[0]!.shipments[1]!.id;

    await journey(seller, order.orderPublicId, firstShipmentId, 'dispatched').expect(201);
    await journey(seller, order.orderPublicId, firstShipmentId, 'delivered').expect(201);
    await pumpFinance();

    // One unit delivered of three: nothing becomes available, and no
    // proportional guess is recorded.
    expect(await countPayoutAvailabilityRows(order.orderInternalId)).toBe(0);
    expect(await readDeliveredOutboxRows(order.orderInternalId)).toHaveLength(0);

    const afterFirst = await readPayablePosition(shopInternalId);
    expect(afterFirst).toMatchObject({
      currency: order.currency,
      available_minor: 0,
      not_yet_available_minor: order.creditMinor,
    });

    await journey(seller, order.orderPublicId, secondShipmentId, 'dispatched').expect(201);
    await journey(seller, order.orderPublicId, secondShipmentId, 'delivered').expect(201);
    await pumpFinance();

    // The whole Order credit moves at once, only once the last unit lands.
    const afterSecond = await readPayablePosition(shopInternalId);
    expect(afterSecond).toMatchObject({
      currency: order.currency,
      available_minor: order.creditMinor,
      not_yet_available_minor: 0,
    });
    expect(await countPayoutAvailabilityRows(order.orderInternalId)).toBe(1);
  });

  it('3. Replay is a no-op', async () => {
    const { seller, shopInternalId, inventoryId } = await createShopWithProduct('pay-replay', {
      amountMinor: 2500,
      stock: 5,
    });
    const buyer = await registerBuyer('pay-replay-buyer');
    const order = await placeAndPayCardOrder(buyer, inventoryId, 1);

    const prepared = await prepareShipment(seller, order.orderPublicId, {
      items: [{ order_item_id: await readOrderItemId(order.orderInternalId), quantity: 1 }],
      carrier: 'USPS',
      tracking_number: 'REPLAY-1',
    }).expect(201);
    const shipmentId = (prepared.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!.id;

    const dispatchKey = randomUUID();
    const deliverKey = randomUUID();
    await journey(seller, order.orderPublicId, shipmentId, 'dispatched', dispatchKey).expect(201);
    await journey(seller, order.orderPublicId, shipmentId, 'delivered', deliverKey).expect(201);
    await pumpFinance();

    const before = await readPayablePosition(shopInternalId);
    expect(before).toMatchObject({
      available_minor: order.creditMinor,
      not_yet_available_minor: 0,
    });
    expect(await countPayoutAvailabilityRows(order.orderInternalId)).toBe(1);
    expect(await readDeliveredOutboxRows(order.orderInternalId)).toHaveLength(1);

    // Re-issuing the identical delivery command writes no second outbox row.
    await journey(seller, order.orderPublicId, shipmentId, 'delivered', deliverKey).expect(201);
    expect(await readDeliveredOutboxRows(order.orderInternalId)).toHaveLength(1);

    // Re-running the finance pump, even after forcing the event due again,
    // leaves the availability and the position untouched.
    const reset = await sql.query(
      `update "outbox_events"
       set "status" = 'pending', "available_at" = now() - interval '1 minute',
           "attempt_count" = 0, "processed_at" = null, "last_error" = null
       where "event_name" = 'order.delivered' and "aggregate_id" = $1
       returning "id"`,
      [order.orderInternalId],
    );
    expect(reset.rowCount).toBe(1);

    await pumpFinance();
    expect(await readDeliveredOutboxRows(order.orderInternalId)).toHaveLength(1);
    expect(await countPayoutAvailabilityRows(order.orderInternalId)).toBe(1);

    const after = await readPayablePosition(shopInternalId);
    expect(after).toEqual(before);

    const payable = await readPayable(seller, seller.shopPublicId);
    expect(payable).toMatchObject({
      available_minor: order.creditMinor,
      not_yet_available_minor: 0,
    });
  });

  it('4. An Order whose required units are all canceled is not treated as delivered', async () => {
    const { seller, shopInternalId, inventoryId } = await createShopWithProduct('pay-cancel', {
      amountMinor: 3500,
      stock: 5,
    });
    const buyer = await registerBuyer('pay-cancel-buyer');
    const order = await placeAndPayCardOrder(buyer, inventoryId, 1);

    await prepareShipment(seller, order.orderPublicId, {
      items: [{ order_item_id: await readOrderItemId(order.orderInternalId), quantity: 1 }],
      carrier: 'USPS',
      tracking_number: 'CANCEL-1',
    }).expect(201);

    await cancelOrder(seller, order.orderPublicId, 'Buyer changed their mind').expect(200);

    await pumpFinance();

    // Cancellation is never delivery: no delivery event, no availability.
    expect(await readDeliveredOutboxRows(order.orderInternalId)).toHaveLength(0);
    expect(await countPayoutAvailabilityRows(order.orderInternalId)).toBe(0);

    const position = await readPayablePosition(shopInternalId);
    expect(position).toMatchObject({
      currency: order.currency,
      available_minor: 0,
      not_yet_available_minor: order.creditMinor,
    });

    const payable = await readPayable(seller, seller.shopPublicId);
    expect(payable).toMatchObject({
      available_minor: 0,
      not_yet_available_minor: order.creditMinor,
    });
  });

  it('5. Concurrent availability recording is recorded once', async () => {
    const { seller, shopInternalId, inventoryId } = await createShopWithProduct('pay-concurrent', {
      amountMinor: 4500,
      stock: 5,
    });
    const buyer = await registerBuyer('pay-concurrent-buyer');
    const order = await placeAndPayCardOrder(buyer, inventoryId, 1);

    const prepared = await prepareShipment(seller, order.orderPublicId, {
      items: [{ order_item_id: await readOrderItemId(order.orderInternalId), quantity: 1 }],
      carrier: 'USPS',
      tracking_number: 'CONCURRENT-1',
    }).expect(201);
    const shipmentId = (prepared.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!.id;

    await journey(seller, order.orderPublicId, shipmentId, 'dispatched').expect(201);
    await journey(seller, order.orderPublicId, shipmentId, 'delivered').expect(201);

    // The delivery event is durable but not yet processed; drive two real
    // use-case executions concurrently against the database, bypassing the
    // outbox claim so the repository's own uniqueness is what protects the move.
    const [deliveredRow] = await readDeliveredOutboxRows(order.orderInternalId);
    expect(deliveredRow).toBeDefined();
    const payload = deliveredRow!.payload as OrderDeliveredEvent;

    const makeUseCase = () => {
      const entityManager = app.get(EntityManager).fork();

      return new RecordPayoutAvailabilityUseCase(
        entityManager,
        new MikroOrmJournalEntryRepository(entityManager),
        new MikroOrmPayoutAvailabilityRepository(entityManager),
        new MikroOrmSellerPayableCommandRepository(entityManager),
        new MikroOrmOrderPaidEventRepository(entityManager),
      );
    };

    const results = await Promise.all([
      makeUseCase().execute(payload),
      makeUseCase().execute(payload),
    ]);

    // Exactly one of the two executions recorded and moved the money.
    expect(results.filter((result) => result.recorded)).toHaveLength(1);

    expect(await countPayoutAvailabilityRows(order.orderInternalId)).toBe(1);

    const position = await readPayablePosition(shopInternalId);
    expect(position).toMatchObject({
      currency: order.currency,
      available_minor: order.creditMinor,
      not_yet_available_minor: 0,
    });

    const payable = await readPayable(seller, seller.shopPublicId);
    expect(payable).toMatchObject({
      available_minor: order.creditMinor,
      not_yet_available_minor: 0,
    });
  });

  it('6. The seller-scoped endpoint reports both figures and refuses a non-owner', async () => {
    const { seller, inventoryId } = await createShopWithProduct('pay-endpoint', {
      amountMinor: 5200,
      stock: 5,
    });
    const buyer = await registerBuyer('pay-endpoint-buyer');
    const order = await placeAndPayCardOrder(buyer, inventoryId, 1);

    const unrelatedSeller = await registerSeller('pay-endpoint-other');

    const prepared = await prepareShipment(seller, order.orderPublicId, {
      items: [{ order_item_id: await readOrderItemId(order.orderInternalId), quantity: 1 }],
      carrier: 'USPS',
      tracking_number: 'ENDPOINT-1',
    }).expect(201);
    const shipmentId = (prepared.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!.id;

    await journey(seller, order.orderPublicId, shipmentId, 'dispatched').expect(201);
    await journey(seller, order.orderPublicId, shipmentId, 'delivered').expect(201);
    await pumpFinance();

    // The paying seller reads both figures as separate integers.
    const payable = await readPayable(seller, seller.shopPublicId);
    expect(payable).toMatchObject({
      currency: order.currency,
      available_minor: order.creditMinor,
      not_yet_available_minor: 0,
    });
    expect(Object.keys(payable).sort()).toEqual([
      'available_minor',
      'currency',
      'not_yet_available_minor',
    ]);
    expect(Number.isInteger(payable.available_minor)).toBe(true);
    expect(Number.isInteger(payable.not_yet_available_minor)).toBe(true);
    expect(JSON.stringify(payable)).not.toContain('_major');

    // Another seller cannot read it.
    await unrelatedSeller.agent
      .get(`${API_PREFIX}/shops/${seller.shopPublicId}/finance/payable`)
      .expect(403);
  });

  it('7. A delivered Order with no paid event is a no-op', async () => {
    const { seller, shopInternalId, inventoryId } = await createShopWithProduct('pay-cash', {
      amountMinor: 2200,
      stock: 5,
    });
    const buyer = await registerBuyer('pay-cash-buyer');

    await addCartItem(buyer, inventoryId, 1);
    const quote = await createQuote(buyer);
    const orderResponse = await confirmOrder(buyer, quote.quote_id, 'cash');
    expect(orderResponse.status).toBe(201);

    const orderPublicId = orderResponse.body.order_shops[0].id as string;
    const order = await readOrderMoneyRow(orderPublicId);

    // A cash Order never gets an `order.paid` outbox row.
    expect(await readPaidOutboxRows(order.id)).toHaveLength(0);

    const prepared = await prepareShipment(seller, orderPublicId, {
      items: [{ order_item_id: await readOrderItemId(order.id), quantity: 1 }],
      carrier: 'USPS',
      tracking_number: 'CASH-1',
    }).expect(201);
    const shipmentId = (prepared.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!.id;

    await journey(seller, orderPublicId, shipmentId, 'dispatched').expect(201);
    await journey(seller, orderPublicId, shipmentId, 'delivered').expect(201);

    const processed = await pumpFinance();
    expect(processed).toBeGreaterThan(0);

    // The delivery is retired as a no-op: nothing available, and no retry loop
    // waiting for a paid posting that will never come.
    expect(await readDeliveredOutboxRows(order.id)).toHaveLength(1);
    expect((await readDeliveredOutboxRows(order.id))[0]!.status).toBe('processed');
    expect(await readPayoutAvailabilityRows(order.id)).toHaveLength(0);
    expect(await readPayablePosition(shopInternalId)).toBeUndefined();
  });

  it('8. A delivery that overtakes its paid event stays retryable', async () => {
    const { seller, shopInternalId, inventoryId } = await createShopWithProduct('pay-race', {
      amountMinor: 3600,
      stock: 5,
    });
    const buyer = await registerBuyer('pay-race-buyer');

    await addCartItem(buyer, inventoryId, 1);
    const quote = await createQuote(buyer);
    const orderResponse = await confirmOrder(buyer, quote.quote_id, 'card');
    expect(orderResponse.status).toBe(201);

    const orderPublicId = orderResponse.body.order_shops[0].id as string;
    const checkoutSessionId = await readOrderSessionId(orderPublicId);

    // Pay the Order but hold Finance back, so its `order.paid` event is queued
    // and its Journal Entry does not exist yet.
    await completeCardSession(checkoutSessionId);

    const moneyRow = await readOrderMoneyRow(orderPublicId);
    const orderInternalId = moneyRow.id;
    const creditMinor =
      moneyRow.subtotal_minor - moneyRow.discount_minor + moneyRow.shipping_minor;
    const moneyEventKey = `order.paid:${orderInternalId}`;

    const [paidRow] = await readPaidOutboxRows(orderInternalId);
    expect(paidRow).toBeDefined();
    expect(paidRow!.status).toBe('pending');
    expect(await sumSellerPayablePostingsForEntry(moneyEventKey)).toBe(0);

    const prepared = await prepareShipment(seller, orderPublicId, {
      items: [{ order_item_id: await readOrderItemId(orderInternalId), quantity: 1 }],
      carrier: 'USPS',
      tracking_number: 'RACE-1',
    }).expect(201);
    const shipmentId = (prepared.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!.id;

    await journey(seller, orderPublicId, shipmentId, 'dispatched').expect(201);
    await journey(seller, orderPublicId, shipmentId, 'delivered').expect(201);

    const [deliveredRow] = await readDeliveredOutboxRows(orderInternalId);
    expect(deliveredRow).toBeDefined();

    const processor = app.get(FinanceMoneyEventProcessorService);

    // The delivery is processed while the paid posting is still in flight: it
    // must fail to stay retryable rather than retire and lose the payout.
    expect(await processor.processEventById(deliveredRow!.id)).toBe(false);
    expect((await readDeliveredOutboxRows(orderInternalId))[0]!.status).toBe('pending');
    expect(await countPayoutAvailabilityRows(orderInternalId)).toBe(0);

    // The paid event lands later: its Journal Entry now exists.
    expect(await processor.processEventById(paidRow!.id)).toBe(true);
    expect(await sumSellerPayablePostingsForEntry(moneyEventKey)).toBe(creditMinor);

    // The failed attempt backed off; force it due again and retry delivery.
    await sql.query(
      `update "outbox_events"
       set "available_at" = now() - interval '1 minute'
       where "id" = $1`,
      [deliveredRow!.id],
    );

    expect(await processor.processEventById(deliveredRow!.id)).toBe(true);

    // Exactly one availability record, and the balance moved once.
    expect(await countPayoutAvailabilityRows(orderInternalId)).toBe(1);
    expect((await readDeliveredOutboxRows(orderInternalId))[0]!.status).toBe('processed');

    const position = await readPayablePosition(shopInternalId);
    expect(position).toMatchObject({
      currency: moneyRow.currency,
      available_minor: creditMinor,
      not_yet_available_minor: 0,
    });
  });

  it('9. An Order paid in another currency becomes available as its converted settlement amount', async () => {
    // The shop prices in USD and this buyer pays in VND, so the amount that moves
    // into the shop's available balance is the converted Posting, not the charge.
    await seedExchangeRate('USD', 'VND', '25000');
    await seedExchangeRate('VND', 'USD', '0.00004');

    const { seller, shopInternalId, inventoryId } = await createShopWithProduct('pay-avail-fx', {
      amountMinor: 1000,
      stock: 5,
    });
    const buyer = await registerBuyer('pay-avail-fx-buyer');
    await setBuyerMarket(buyer, { region: 'Vietnam', language: 'la', currency: 'VND' });

    await addCartItem(buyer, inventoryId, 1);
    const quote = await createQuote(buyer);
    expect(quote.checkout_currency).toBe('VND');

    const orderResponse = await confirmOrder(buyer, quote.quote_id, 'card');
    expect(orderResponse.status).toBe(201);

    const orderPublicId = orderResponse.body.order_shops[0].id as string;
    const checkoutSessionId = await readOrderSessionId(orderPublicId);
    await completeCardSession(checkoutSessionId);
    await pumpFinance();

    const orderRow = await readOrderMoneyRow(orderPublicId);
    expect(orderRow.currency).toBe('VND');

    // The payable Posting settled at 1599 USD minor: 1000 of goods plus 599 of
    // shipping, each converted from VND.
    const moneyEventKey = `order.paid:${orderRow.id}`;
    const payableAmount = await sumSellerPayablePostingsForEntry(moneyEventKey);
    expect(payableAmount).toBe(1599);

    const prepared = await prepareShipment(seller, orderPublicId, {
      items: [{ order_item_id: await readOrderItemId(orderRow.id), quantity: 1 }],
      carrier: 'USPS',
      tracking_number: 'AVAIL-FX-1',
    }).expect(201);
    const shipmentId = (prepared.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!.id;

    await journey(seller, orderPublicId, shipmentId, 'dispatched').expect(201);
    await journey(seller, orderPublicId, shipmentId, 'delivered').expect(201);
    await pumpFinance();

    // The availability record and the moved balance are in the shop's currency.
    const rows = await readPayoutAvailabilityRows(orderRow.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      currency: 'USD',
      amount_minor: payableAmount,
    });

    const position = await readPayablePosition(shopInternalId);
    expect(position).toMatchObject({
      currency: 'USD',
      available_minor: payableAmount,
      not_yet_available_minor: 0,
    });
  });

  it('10. An Order whose status moves forward without a delivery records no availability', async () => {
    const { shopInternalId, inventoryId } = await createShopWithProduct('pay-avail-status', {
      amountMinor: 2100,
      stock: 5,
    });
    const buyer = await registerBuyer('pay-avail-status-buyer');
    const order = await placeAndPayCardOrder(buyer, inventoryId, 1);

    const before = await readPayablePosition(shopInternalId);
    expect(before).toMatchObject({
      available_minor: 0,
      not_yet_available_minor: order.creditMinor,
    });

    // The Order's commercial status is never Finance's input: moving it forward
    // directly must leave the money exactly where it was.
    await sql.query(
      'update "orders" set "status" = $2 where "id" = $1',
      [order.orderInternalId, 'completed'],
    );

    await pumpFinance();

    expect(await countPayoutAvailabilityRows(order.orderInternalId)).toBe(0);
    expect(await readDeliveredOutboxRows(order.orderInternalId)).toHaveLength(0);
    expect(await readPayablePosition(shopInternalId)).toEqual(before);
  });
});
