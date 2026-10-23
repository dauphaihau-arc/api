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
  type RefundResult,
} from '~/integrations/payment/app/ports/payment-gateway';
import { ObservabilityService } from '~/platform/observability/observability.service';
import { RequestContextService } from '~/platform/request-context/request-context.service';
import { FinanceMoneyEventProcessorService } from '~/domains/finance/app/services/finance-money-event-processor.service';
import { OrderRefundService } from '~/domains/order/app/services/order-refund.service';
import { createTestDatabase, dropTestDatabase } from '../support/test-postgres';
import type { TestDatabaseContext } from '../support/test-postgres';
import { seedAuthReferenceData } from '../../database/seeds/auth.seed';
import { resolveShopId, seedPublishableInventory } from '../support/shipping-fixtures';

jest.setTimeout(300_000);

const API_PREFIX = '/v1';
const VALID_TEST_PASSWORD = 'Password123!';
const SCHEDULE_EFFECTIVE_FROM = '2020-01-01T00:00:00.000Z';

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

type RefundFact = {
  id: string;
  status: string;
  amount_minor: number;
  refunded_amount_minor: number | null;
  provider_refund_id: string | null;
};

type PaidOrder = {
  orderInternalId: string;
  orderPublicId: string;
  currency: string;
  paidTotalMinor: number;
  moneyEventKey: string;
};

type ShopFixture = {
  seller: TestSeller;
  buyer: TestBuyer;
  inventoryId: string;
  shopInternalId: string;
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
 * Background jobs are outside this suite's subject: the refund execution is
 * driven directly through `OrderRefundService`, so every money fact and ledger
 * write still runs through the real application.
 */
class NoopJobDispatcher extends JobDispatcher {
  async dispatch<TName extends AppJobName>(
    _name: TName,
    _payload: AppJobPayloadMap[TName],
    _options?: DispatchJobOptions,
  ): Promise<void> {}
}

/**
 * In-memory payment double for the provider's two money-fact seams: checkout
 * sessions and refunds. It remembers what each payment intent charged, so a
 * refund with no amount returns — and reports — the remaining charge the way a
 * real provider does.
 */
class FakePaymentGateway extends PaymentGateway {
  readonly refundCalls: string[] = [];
  readonly refunds = new Map<string, RefundResult>();
  private nextEvent: PaymentWebhookEvent | null = null;
  private refundMode: 'succeeded' | 'failed' | 'pending' | 'throw' = 'succeeded';
  private readonly chargeAmountsMinor = new Map<string, number>();

  queueEvent(event: PaymentWebhookEvent): void {
    const object = event.data.object as {
      paymentIntentId?: string;
      amountMinor?: number;
    } | null;

    if (object?.paymentIntentId && typeof object.amountMinor === 'number') {
      this.chargeAmountsMinor.set(object.paymentIntentId, object.amountMinor);
    }

    this.nextEvent = event;
  }

  setRefundMode(mode: 'succeeded' | 'failed' | 'pending' | 'throw'): void {
    this.refundMode = mode;
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

  async createRefund(paymentIntentId: string) {
    this.refundCalls.push(paymentIntentId);
    const amountMinor = this.chargeAmountsMinor.get(paymentIntentId) ?? 0;

    if (this.refundMode === 'throw') {
      throw new Error('Stripe refund timeout');
    }

    const refund = this.refundMode === 'failed'
      ? {
        id: `re_failed_${randomUUID()}`,
        status: 'failed',
        amount: amountMinor,
        failureReason: 'card_declined',
      }
      : this.refundMode === 'pending'
        ? {
          id: `re_pending_${randomUUID()}`,
          status: 'pending',
          amount: amountMinor,
        }
        : {
          id: `re_test_${randomUUID()}`,
          status: 'succeeded',
          amount: amountMinor,
        };

    this.refunds.set(refund.id, refund);

    return refund;
  }

  async retrieveRefund(refundId: string) {
    const refund = this.refunds.get(refundId);

    if (!refund) {
      throw new Error(`No refund ${refundId} on FakePaymentGateway`);
    }

    return refund;
  }

  settleRefund(
    refundId: string,
    status: 'succeeded' | 'failed',
    failureReason?: string,
  ): RefundResult {
    const refund = this.refunds.get(refundId);

    if (!refund) {
      throw new Error(`No refund ${refundId} on FakePaymentGateway`);
    }

    const settled = { ...refund, status, failureReason };
    this.refunds.set(refundId, settled);

    return settled;
  }
}

// eslint-disable-next-line max-lines-per-function
describe('Order Refunds reverse Seller Payable and Platform Commission (integration)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: TestDatabase;
  let storageRoot: string;
  let sql: Client;
  let gateway: FakePaymentGateway;
  let categoryId: string | undefined;

  let primaryShop: ShopFixture;
  let fullRefundShop: ShopFixture;
  let cutoverShop: ShopFixture;
  let delayedPaidShop: ShopFixture;
  let fxFullRefundShop: ShopFixture;
  let externalRefundShop: ShopFixture;

  let admin: TestAgent;
  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase('finance_order_refund');
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-refund-int-'));
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

    admin = await registerAdmin('refund-admin');
    primaryShop = await createShopFixture('refund-primary');
    fullRefundShop = await createShopFixture('refund-full');
    cutoverShop = await createShopFixture('refund-cutover');
    delayedPaidShop = await createShopFixture('refund-delayed-paid');
    fxFullRefundShop = await createShopFixture('refund-fx-full');
    externalRefundShop = await createShopFixture('refund-external');
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
        shop_name: `ref${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`,
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
        full_name: 'Refund Buyer',
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
      .send({ name: 'Refund ledger', rank: 1 })
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
        description: 'Refund ledger product',
        who_made: ProductWhoMade.I_DID,
        is_digital: false,
      })
      .expect(201);
    const productPublicId = productResponse.body.id as string;

    await input.seller.agent
      .put(`${API_PREFIX}/shops/${input.seller.shopPublicId}/products/${productPublicId}/images`)
      .attach('images', Buffer.from(`image-${productPublicId}`), {
        filename: `${productPublicId}.jpg`,
        contentType: 'image/jpeg',
      })
      .expect(204);

    const detail = await input.seller.agent
      .get(`${API_PREFIX}/shops/${input.seller.shopPublicId}/products/${productPublicId}`)
      .expect(200);
    const inventoryId = detail.body.inventory[0].id as string;

    await seedPublishableInventory(sql, {
      shopId: input.seller.shopId,
      inventoryId,
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

    return { productId: productPublicId, inventoryId };
  }

  /**
   * A fresh shop per scenario keeps every absolute balance expectation honest:
   * the fixture prices one 2500-minor item, ships it for 599, and charges 10%
   * commission on the discounted item subtotal.
   */
  async function createShopFixture(prefix: string): Promise<ShopFixture> {
    const seller = await registerSeller(prefix);
    const shopInternalId = await resolveShopId(sql, seller.shopPublicId);
    const profile = await createActiveProfile(seller);
    const product = await createPublishableProduct({
      seller,
      shippingProfileId: profile.id,
      title: `${prefix} mug`,
      sku: `${prefix}-${randomUUID()}`,
      amountMinor: 2500,
      stock: 15,
    });
    const buyer = await registerBuyer(`${prefix}-buyer`);

    const schedule = await admin.agent
      .put(`${API_PREFIX}/admin/shops/${seller.shopPublicId}/commission-schedule`)
      .set('Idempotency-Key', randomUUID())
      .send({ effective_from: SCHEDULE_EFFECTIVE_FROM, rate_basis_points: 1000 });
    expect(schedule.status).toBe(200);

    return {
      seller,
      buyer,
      inventoryId: product.inventoryId,
      shopInternalId,
    };
  }

  async function addCartItem(shop: ShopFixture, quantity: number): Promise<void> {
    await shop.buyer.agent
      .post(`${API_PREFIX}/cart/items`)
      .set('Idempotency-Key', randomUUID())
      .send({ inventory_id: shop.inventoryId, quantity })
      .expect(201);
  }

  async function createQuote(shop: ShopFixture): Promise<ShippingQuoteResponse> {
    const response = await shop.buyer.agent
      .post(`${API_PREFIX}/me/checkout/quote`)
      .set('Idempotency-Key', randomUUID())
      .send({ user_address_id: shop.buyer.addressId });

    expect(response.body).toMatchObject({
      quote_id: expect.any(String),
      checkout_currency: expect.any(String),
      total_minor: expect.any(Number),
      shops: expect.any(Array),
    });

    return response.body as ShippingQuoteResponse;
  }

  async function seedExchangeRate(
    fromCurrency: string,
    toCurrency: string,
    rate: string,
  ): Promise<void> {
    await sql.query(
      `insert into "exchange_rates"
         ("id", "created_at", "updated_at", "from_currency", "to_currency",
          "rate", "effective_at", "expires_at", "source", "source_timestamp")
       values ($1, now(), now(), $2, $3, $4, now() - interval '1 day',
               null, 'refund-test-rates', now() - interval '1 day')`,
      [randomUUID(), fromCurrency, toCurrency, rate],
    );
  }

  async function setBuyerCurrency(
    shop: ShopFixture,
    preferences: { region: string; language: string; currency: string },
  ): Promise<void> {
    await shop.buyer.agent
      .patch(`${API_PREFIX}/me`)
      .set('Idempotency-Key', randomUUID())
      .send({ preferences })
      .expect(200);
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

  async function readOrderPaymentIntentId(orderPublicId: string): Promise<string> {
    const result = await sql.query(
      `select "payment_details" ->> 'payment_intent_id' as "payment_intent_id"
       from "orders" where "public_id" = $1`,
      [orderPublicId],
    );

    const paymentIntentId = result.rows[0]?.payment_intent_id as string | undefined;

    if (!paymentIntentId) {
      throw new Error(`Order ${orderPublicId} has no payment_intent_id`);
    }

    return paymentIntentId;
  }

  async function completeCardSession(
    sessionId: string,
    amountMinor: number,
  ): Promise<void> {
    gateway.queueEvent({
      id: `evt_${randomUUID()}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          paymentStatus: 'paid',
          paymentIntentId: `pi_${randomUUID()}`,
          amountMinor,
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
   * Delivers the provider's own report of a refund, which is what settles it.
   * The create response only acknowledges the request.
   */
  async function deliverRefundEvent(
    paymentIntentId: string,
    type: 'refund.updated' | 'refund.failed' = 'refund.updated',
  ): Promise<void> {
    const refund = [...gateway.refunds.values()].at(-1);

    if (!refund) {
      throw new Error('FakePaymentGateway has created no refund');
    }

    gateway.queueEvent({
      id: `evt_${randomUUID()}`,
      type,
      data: {
        object: {
          id: refund.id,
          paymentIntentId,
          status: refund.status,
          amount: refund.amount,
          failureReason: refund.failureReason,
        },
      },
    });

    await request(app.getHttpServer())
      .post(`${API_PREFIX}/webhooks/stripe`)
      .send({ type })
      .expect(201);
  }

  /**
   * Delivers a refund event the app never requested, the way the provider
   * reports a refund issued in its own dashboard.
   */
  async function deliverExternalRefundEvent(input: {
    providerRefundId: string;
    paymentIntentId: string;
    status: 'succeeded' | 'failed' | 'pending';
    amountMinor: number;
  }): Promise<void> {
    const type = input.status === 'succeeded' ? 'refund.created' : 'refund.updated';

    gateway.queueEvent({
      id: `evt_${randomUUID()}`,
      type,
      data: {
        object: {
          id: input.providerRefundId,
          paymentIntentId: input.paymentIntentId,
          status: input.status,
          amount: input.amountMinor,
        },
      },
    });

    await request(app.getHttpServer())
      .post(`${API_PREFIX}/webhooks/stripe`)
      .send({ type })
      .expect(201);
  }

  async function placeAndPayCardOrder(
    shop: ShopFixture,
    quantity = 1,
    processPaidEvent = true,
  ): Promise<PaidOrder> {
    await addCartItem(shop, quantity);
    const quote = await createQuote(shop);
    const orderResponse = await shop.buyer.agent
      .post(`${API_PREFIX}/me/checkout`)
      .set('Idempotency-Key', randomUUID())
      .send({ quote_id: quote.quote_id, payment_type: 'card' });
    expect(orderResponse.status).toBe(201);

    const orderPublicId = orderResponse.body.order_shops[0].id as string;
    const row = await readOrderMoneyRow(orderPublicId);
    const checkoutSessionId = await readOrderSessionId(orderPublicId);
    // The provider knows the charge it created, and a refund without an amount
    // returns exactly that charge.
    await completeCardSession(checkoutSessionId, row.total_minor);
    if (processPaidEvent) {
      await pumpFinance();
    }

    return {
      orderInternalId: row.id,
      orderPublicId,
      currency: row.currency,
      paidTotalMinor: row.total_minor,
      moneyEventKey: `order.paid:${row.id}`,
    };
  }

  /**
   * Records Payout Availability the way a delivered, fully shipped Order does.
   * Delivery mechanics are the availability suite's subject; Finance consumes
   * the same durable outbox row here.
   */
  async function recordDelivered(order: PaidOrder): Promise<void> {
    await sql.query(
      `insert into "outbox_events"
         ("id", "created_at", "updated_at", "event_name", "aggregate_type",
          "aggregate_id", "payload", "status", "attempt_count", "available_at")
       values ($1, now(), now(), 'order.delivered', 'order', $2, $3::jsonb,
               'pending', 0, now() - interval '1 minute')`,
      [
        randomUUID(),
        order.orderInternalId,
        JSON.stringify({
          orderId: order.orderInternalId,
          deliveredAt: new Date().toISOString(),
          occurredAt: new Date().toISOString(),
          evidence: [{
            shipmentId: randomUUID(),
            shipmentPublicId: `shp_${randomUUID()}`,
            deliveredAt: new Date().toISOString(),
          }],
        }),
      ],
    );
    await pumpFinance();
  }

  /** The seller refund endpoint decides by Ordering state; COMPLETED qualifies. */
  async function markOrderCompleted(order: PaidOrder): Promise<void> {
    await sql.query(
      'update "orders" set "status" = \'completed\', "updated_at" = now() where "id" = $1',
      [order.orderInternalId],
    );
  }

  async function cancelOrder(shop: ShopFixture, order: PaidOrder): Promise<void> {
    await shop.buyer.agent
      .patch(`${API_PREFIX}/me/orders/${order.orderPublicId}/cancel-request`)
      .send({ cancel_reason: 'Refund scenario' })
      .expect(200);
  }

  function adminRefund(order: PaidOrder, body: Record<string, unknown>) {
    return admin.agent
      .patch(`${API_PREFIX}/admin/orders/${order.orderPublicId}/refund`)
      .set('Idempotency-Key', randomUUID())
      .send(body);
  }

  function sellerRefund(
    shop: ShopFixture,
    order: PaidOrder,
    body: Record<string, unknown>,
  ) {
    return shop.seller.agent
      .patch(`${API_PREFIX}/shops/${shop.seller.shopPublicId}/orders/${order.orderPublicId}/refund`)
      .set('Idempotency-Key', randomUUID())
      .send(body);
  }

  async function processRefund(order: PaidOrder): Promise<void> {
    await app.get(OrderRefundService).processRefund(order.orderInternalId);
  }

  async function readLatestRefundFact(order: PaidOrder): Promise<RefundFact> {
    const result = await sql.query(
      `select "id", "status", "amount_minor", "refunded_amount_minor", "provider_refund_id"
       from "order_refunds"
       where "order_id" = $1
       order by "requested_at" desc, "created_at" desc
       limit 1`,
      [order.orderInternalId],
    );

    const row = result.rows[0] as RefundFact | undefined;

    if (!row) {
      throw new Error(`Order ${order.orderInternalId} has no refund fact`);
    }

    return row;
  }

  async function countRefundFacts(order: PaidOrder): Promise<number> {
    const result = await sql.query(
      'select count(*)::int as "count" from "order_refunds" where "order_id" = $1',
      [order.orderInternalId],
    );

    return result.rows[0].count as number;
  }

  async function countRefundMoneyEvents(order: PaidOrder): Promise<number> {
    const result = await sql.query(
      `select count(*)::int as "count" from "outbox_events"
       where "event_name" = 'order.refunded' and "payload" ->> 'orderId' = $1`,
      [order.orderInternalId],
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

  async function sumSellerPayablePostingsForOrder(order: PaidOrder): Promise<number> {
    const result = await sql.query(
      `select coalesce(sum(p."amount_minor"), 0)::int as "total"
       from "postings" p
       join "journal_entries" je on je."id" = p."journal_entry_id"
       join "ledger_accounts" la on la."id" = p."ledger_account_id"
       where la."kind" = 'seller_payable'
         and (je."money_event_key" = $1 or je."money_event_key" like $2)`,
      [order.moneyEventKey, `order.refund:${order.orderInternalId}:%`],
    );

    return result.rows[0].total as number;
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

  async function readPayablePosition(
    shopInternalId: string,
  ): Promise<PayablePosition | undefined> {
    const result = await sql.query(
      `select "currency", "available_balance_minor" as "available_minor",
              "pending_balance_minor" as "not_yet_available_minor"
       from "seller_payable_balances"
       where "shop_id" = $1`,
      [shopInternalId],
    );

    return result.rows[0] as PayablePosition | undefined;
  }

  async function readPayable(shop: ShopFixture): Promise<PayablePosition> {
    const response = await shop.seller.agent
      .get(`${API_PREFIX}/shops/${shop.seller.shopPublicId}/finance/payable`)
      .expect(200);

    return response.body as PayablePosition;
  }

  it('A full refund reverses the paid entry and returns the Order contribution to zero', async () => {
    const shop = primaryShop;
    const order = await placeAndPayCardOrder(shop);

    const orderRow = await readOrderMoneyRow(order.orderPublicId);
    expect(orderRow).toMatchObject({
      currency: 'USD',
      subtotal_minor: 2500,
      shipping_minor: 599,
      total_minor: 3099,
    });
    expect(await sumPostingsByKindForEntry(order.moneyEventKey, 'platform_commission')).toBe(250);

    const before = await readPayablePosition(shop.shopInternalId);
    expect(before).toMatchObject({
      currency: 'USD',
      available_minor: 0,
      not_yet_available_minor: 2849,
    });

    // A buyer cancellation is the public path that makes the Order refundable.
    await cancelOrder(shop, order);

    const refundResponse = await adminRefund(order, { action: 'mark_succeeded' });
    expect(refundResponse.status).toBe(200);
    await pumpFinance();

    // The refund returns the whole charge; the caller never named an amount.
    const refund = await readLatestRefundFact(order);
    expect(refund).toMatchObject({
      status: 'succeeded',
      amount_minor: 3099,
      refunded_amount_minor: 3099,
    });

    const refundKey = `order.refund:${order.orderInternalId}:${refund.id}`;
    expect(await countJournalEntries(refundKey)).toBe(1);

    // The entry is denominated in the Settlement Currency, keeps what was
    // charged, and balances to zero.
    expect(await readJournalEntry(refundKey)).toMatchObject({
      currency: 'USD',
      charge_currency: 'USD',
      charge_amount_minor: 3099,
    });
    expect(await sumPostingsForEntry(refundKey)).toBe(0);

    // The whole 250 commission returns, and the seller's 2849 is reversed.
    expect(await sumPostingsByKindForEntry(refundKey, 'platform_commission')).toBe(-250);
    expect(await sumPostingsByKindForEntry(refundKey, 'seller_payable')).toBe(-2849);
    expect(await sumPostingsByKindForEntry(refundKey, 'platform_clearing')).toBe(3099);

    expect(await sumSellerPayablePostingsForOrder(order)).toBe(0);
    expect(await readPayablePosition(shop.shopInternalId)).toMatchObject({
      currency: 'USD',
      available_minor: 0,
      not_yet_available_minor: 0,
    });
  });

  it('A refund accepts no amount and can only return the remaining charge once', async () => {
    const shop = fullRefundShop;
    const order = await placeAndPayCardOrder(shop);
    await cancelOrder(shop, order);

    // The contract is action-only: an amount is not part of the request.
    const withAmount = await adminRefund(order, {
      action: 'mark_succeeded',
      amount_minor: 1000,
    });
    expect(withAmount.status).toBe(400);
    expect(await countRefundFacts(order)).toBe(0);

    const refund = await adminRefund(order, { action: 'mark_succeeded' });
    expect(refund.status).toBe(200);
    await pumpFinance();

    expect(await countRefundFacts(order)).toBe(1);
    expect((await readLatestRefundFact(order)).amount_minor).toBe(order.paidTotalMinor);

    // Nothing remains, so the action is refused rather than refunding zero.
    const again = await adminRefund(order, { action: 'mark_succeeded' });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('ADMIN_REFUND_ACTION_NOT_ALLOWED');
    expect(await countRefundFacts(order)).toBe(1);
  });

  it('Retries a refund posting once its delayed order.paid posting has been recorded', async () => {
    const shop = delayedPaidShop;
    const order = await placeAndPayCardOrder(shop, 1, false);

    await sql.query(
      `update "outbox_events"
       set "available_at" = now() + interval '1 hour'
       where "event_name" = 'order.paid'
         and "aggregate_id" = $1
         and "status" = 'pending'`,
      [order.orderInternalId],
    );

    await cancelOrder(shop, order);
    const refundResponse = await adminRefund(order, { action: 'mark_succeeded' });
    expect(refundResponse.status).toBe(200);
    const refund = await readLatestRefundFact(order);
    const refundKey = `order.refund:${order.orderInternalId}:${refund.id}`;

    await pumpFinance();

    expect(await countJournalEntries(order.moneyEventKey)).toBe(0);
    expect(await countJournalEntries(refundKey)).toBe(0);

    await sql.query(
      `update "outbox_events"
       set "available_at" = now() - interval '1 minute'
       where ("event_name" = 'order.paid' and "aggregate_id" = $1)
          or ("event_name" = 'order.refunded' and "payload" ->> 'orderId' = $1)`,
      [order.orderInternalId],
    );

    await pumpFinance();

    expect(await countJournalEntries(order.moneyEventKey)).toBe(1);
    expect(await countJournalEntries(refundKey)).toBe(1);
    expect(await sumSellerPayablePostingsForOrder(order)).toBe(0);
    const statuses = await sql.query(
      `select "event_name", "status"
       from "outbox_events"
       where ("event_name" = 'order.paid' and "aggregate_id" = $1)
          or ("event_name" = 'order.refunded' and "payload" ->> 'orderId' = $1)`,
      [order.orderInternalId],
    );
    expect(statuses.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ event_name: 'order.paid', status: 'processed' }),
      expect.objectContaining({ event_name: 'order.refunded', status: 'processed' }),
    ]));
  });

  it('The seller endpoint refunds the whole remaining amount and rejects an amount input', async () => {
    const shop = primaryShop;
    const positionBeforeOrder = await readPayablePosition(shop.shopInternalId);
    const order = await placeAndPayCardOrder(shop);
    await markOrderCompleted(order);

    const withAmount = await sellerRefund(shop, order, {
      action: 'request',
      amount_minor: 1000,
    });
    expect(withAmount.status).toBe(400);
    expect(await countRefundFacts(order)).toBe(0);

    const refundResponse = await sellerRefund(shop, order, { action: 'request' });
    expect(refundResponse.status).toBe(200);

    const callsBefore = gateway.refundCalls.length;
    await processRefund(order);

    // The provider is asked for no amount, and its response only acknowledges
    // the request: the refund is still pending and has not reached Finance.
    expect(gateway.refundCalls).toHaveLength(callsBefore + 1);
    const paymentIntentId = gateway.refundCalls.at(-1)!;

    const pendingRefund = await readLatestRefundFact(order);
    expect(pendingRefund).toMatchObject({
      status: 'pending',
      amount_minor: order.paidTotalMinor,
      refunded_amount_minor: null,
    });
    expect(pendingRefund.provider_refund_id).toEqual(expect.any(String));
    expect(await countRefundMoneyEvents(order)).toBe(0);

    // The provider's event is what settles it.
    await deliverRefundEvent(paymentIntentId);
    await pumpFinance();

    const refund = await readLatestRefundFact(order);
    expect(refund).toMatchObject({
      status: 'succeeded',
      amount_minor: order.paidTotalMinor,
      refunded_amount_minor: order.paidTotalMinor,
    });
    expect(await countJournalEntries(
      `order.refund:${order.orderInternalId}:${refund.id}`,
    )).toBe(1);

    const payable = await readPayable(shop);
    expect(payable.not_yet_available_minor).toBe(
      positionBeforeOrder?.not_yet_available_minor ?? 0,
    );
  });

  it('A refund reduces the balance bucket for its Order availability', async () => {
    const shop = primaryShop;
    const positionBeforeOrders = await readPayablePosition(shop.shopInternalId);
    const baselineNotYetAvailable = positionBeforeOrders?.not_yet_available_minor ?? 0;

    const availableOrder = await placeAndPayCardOrder(shop);
    await recordDelivered(availableOrder);

    const pendingOrder = await placeAndPayCardOrder(shop);

    const before = await readPayablePosition(shop.shopInternalId);
    expect(before).toMatchObject({
      currency: 'USD',
      available_minor: 2849,
      not_yet_available_minor: baselineNotYetAvailable + 2849,
    });

    // The unreleased Order's refund must remove its own pending contribution,
    // not consume another Order's available balance.
    await cancelOrder(shop, pendingOrder);
    const first = await adminRefund(pendingOrder, { action: 'mark_succeeded' });
    expect(first.status).toBe(200);
    await pumpFinance();

    const afterFirst = await readPayablePosition(shop.shopInternalId);

    expect(afterFirst).toMatchObject({
      available_minor: 2849,
      not_yet_available_minor: baselineNotYetAvailable,
    });

    // The released Order's refund removes its available contribution.
    await cancelOrder(shop, availableOrder);
    const second = await adminRefund(availableOrder, { action: 'mark_succeeded' });
    expect(second.status).toBe(200);
    await pumpFinance();

    const afterSecond = await readPayablePosition(shop.shopInternalId);
    expect(afterSecond).toMatchObject({
      available_minor: 0,
      not_yet_available_minor: baselineNotYetAvailable,
    });
    expect(await sumSellerPayablePostingsForOrder(availableOrder)).toBe(0);
    expect(await sumSellerPayablePostingsForOrder(pendingOrder)).toBe(0);
  });

  it('A provider-settled refund removes the released Order contribution from available', async () => {
    const shop = primaryShop;
    const positionBeforeOrder = await readPayablePosition(shop.shopInternalId);
    const baseAvailable = positionBeforeOrder?.available_minor ?? 0;
    const baseNotYetAvailable = positionBeforeOrder?.not_yet_available_minor ?? 0;

    const order = await placeAndPayCardOrder(shop);
    await recordDelivered(order);

    const released = await readPayablePosition(shop.shopInternalId);
    expect(released).toMatchObject({
      available_minor: baseAvailable + 2849,
      not_yet_available_minor: baseNotYetAvailable,
    });

    await cancelOrder(shop, order);
    await processRefund(order);

    // Creation only acknowledges the request, even for a released Order.
    const pendingRefund = await readLatestRefundFact(order);
    expect(pendingRefund.status).toBe('pending');
    expect(pendingRefund.provider_refund_id).toEqual(expect.any(String));
    expect(await countRefundMoneyEvents(order)).toBe(0);

    await deliverRefundEvent(gateway.refundCalls.at(-1)!);
    await pumpFinance();

    const refund = await readLatestRefundFact(order);
    expect(refund).toMatchObject({
      status: 'succeeded',
      amount_minor: order.paidTotalMinor,
      refunded_amount_minor: order.paidTotalMinor,
    });

    const refundKey = `order.refund:${order.orderInternalId}:${refund.id}`;
    expect(await countJournalEntries(refundKey)).toBe(1);
    expect(await sumPostingsForEntry(refundKey)).toBe(0);

    // The released Order's contribution comes out of `available`, never from
    // the pending bucket another Order may still be filling.
    expect(await readPayablePosition(shop.shopInternalId)).toMatchObject({
      available_minor: baseAvailable,
      not_yet_available_minor: baseNotYetAvailable,
    });
    expect(await sumSellerPayablePostingsForOrder(order)).toBe(0);
  });

  it('A refund recorded before delivery leaves nothing to make available', async () => {
    const shop = primaryShop;
    const positionBeforeOrder = await readPayablePosition(shop.shopInternalId);
    const baseAvailable = positionBeforeOrder?.available_minor ?? 0;
    const baseNotYetAvailable = positionBeforeOrder?.not_yet_available_minor ?? 0;

    const order = await placeAndPayCardOrder(shop);
    await cancelOrder(shop, order);

    const refundResponse = await adminRefund(order, { action: 'mark_succeeded' });
    expect(refundResponse.status).toBe(200);
    await pumpFinance();

    // The refund already returned the Order's money while it was still pending.
    const afterRefund = await readPayablePosition(shop.shopInternalId);
    expect(afterRefund).toMatchObject({
      available_minor: baseAvailable,
      not_yet_available_minor: baseNotYetAvailable,
    });

    // A shipment handed to a carrier survives cancellation, so delivery can
    // still arrive after the refund. It must not release the refunded money.
    await recordDelivered(order);

    const availabilities = await sql.query(
      'select count(*)::int as "count" from "payout_availabilities" where "order_id" = $1',
      [order.orderInternalId],
    );
    expect(availabilities.rows[0]?.count).toBe(0);
    expect(await readPayablePosition(shop.shopInternalId)).toMatchObject({
      available_minor: baseAvailable,
      not_yet_available_minor: baseNotYetAvailable,
    });
  });

  it('A provider refusal records a failed refund and changes no balance', async () => {
    const shop = primaryShop;
    const order = await placeAndPayCardOrder(shop);
    await cancelOrder(shop, order);

    const failure = await adminRefund(order, {
      action: 'mark_failed',
      reason: 'Provider declined the first attempt',
    });
    expect(failure.status).toBe(200);

    const retry = await adminRefund(order, { action: 'retry' });
    expect(retry.status).toBe(200);

    const before = await readPayablePosition(shop.shopInternalId);
    gateway.setRefundMode('failed');
    await processRefund(order);
    gateway.setRefundMode('succeeded');

    // A refused create response still leaves the fact pending: the provider
    // event is what records the refusal.
    const pendingRefund = await readLatestRefundFact(order);
    expect(pendingRefund.status).toBe('pending');
    expect(await countRefundMoneyEvents(order)).toBe(0);

    await deliverRefundEvent(
      gateway.refundCalls.at(-1)!,
      'refund.failed',
    );
    await pumpFinance();

    const refund = await readLatestRefundFact(order);
    expect(refund).toMatchObject({
      status: 'failed',
      amount_minor: order.paidTotalMinor,
      refunded_amount_minor: null,
    });
    expect(refund.provider_refund_id).toEqual(expect.any(String));

    expect(await countRefundMoneyEvents(order)).toBe(0);
    expect(await countJournalEntries(
      `order.refund:${order.orderInternalId}:${refund.id}`,
    )).toBe(0);
    expect(await readPayablePosition(shop.shopInternalId)).toEqual(before);
  });

  it('Replaying a succeeded refund posts once and moves the balance once', async () => {
    const shop = primaryShop;
    const positionBeforeOrder = await readPayablePosition(shop.shopInternalId);
    const order = await placeAndPayCardOrder(shop);
    await cancelOrder(shop, order);

    const failure = await adminRefund(order, {
      action: 'mark_failed',
      reason: 'Retry is required',
    });
    expect(failure.status).toBe(200);

    const retry = await adminRefund(order, { action: 'retry' });
    expect(retry.status).toBe(200);
    await processRefund(order);
    await deliverRefundEvent(gateway.refundCalls.at(-1)!);
    await pumpFinance();

    const refund = await readLatestRefundFact(order);
    expect(refund).toMatchObject({
      status: 'succeeded',
      amount_minor: order.paidTotalMinor,
    });

    const refundKey = `order.refund:${order.orderInternalId}:${refund.id}`;
    expect(await countJournalEntries(refundKey)).toBe(1);
    expect(await sumPostingsForEntry(refundKey)).toBe(0);

    // The whole Order contribution comes back out, leaving the position as it
    // was before the Order.
    const afterRefund = await readPayablePosition(shop.shopInternalId);
    expect(afterRefund).toEqual(positionBeforeOrder);

    // The provider can deliver the same outcome again; the settled refund is
    // left alone and no second money event appears.
    await deliverRefundEvent(gateway.refundCalls.at(-1)!);
    await pumpFinance();

    expect(await countJournalEntries(refundKey)).toBe(1);
    expect(await readPayablePosition(shop.shopInternalId)).toEqual(afterRefund);

    const reset = await sql.query(
      `update "outbox_events"
       set "status" = 'pending', "available_at" = now() - interval '1 minute',
           "attempt_count" = 0, "processed_at" = null, "last_error" = null
       where "event_name" = 'order.refunded'
         and "payload" ->> 'orderId' = $1
       returning "id"`,
      [order.orderInternalId],
    );
    expect(reset.rowCount).toBe(1);

    await pumpFinance();

    expect(await countJournalEntries(refundKey)).toBe(1);
    expect(await readPayablePosition(shop.shopInternalId)).toEqual(afterRefund);
  });

  it('Reconciles a pending refund whose provider event never arrived', async () => {
    const shop = primaryShop;
    const positionBeforeOrder = await readPayablePosition(shop.shopInternalId);
    const order = await placeAndPayCardOrder(shop);
    await cancelOrder(shop, order);

    gateway.setRefundMode('pending');
    await processRefund(order);
    gateway.setRefundMode('succeeded');

    const pendingRefund = await readLatestRefundFact(order);
    expect(pendingRefund.status).toBe('pending');

    // The event is lost. The sweep only revisits a refund that has waited long
    // enough not to race the request that created it.
    await sql.query(
      `update "order_refunds" set "requested_at" = now() - interval '1 hour'
       where "id" = $1`,
      [pendingRefund.id],
    );
    gateway.settleRefund(pendingRefund.provider_refund_id!, 'succeeded');

    const reconciled = await app.get(OrderRefundService).reconcilePendingRefunds();
    expect(reconciled).toBeGreaterThanOrEqual(1);

    await pumpFinance();

    const refund = await readLatestRefundFact(order);
    expect(refund).toMatchObject({
      status: 'succeeded',
      refunded_amount_minor: order.paidTotalMinor,
    });
    expect(await countJournalEntries(
      `order.refund:${order.orderInternalId}:${refund.id}`,
    )).toBe(1);
    expect(await readPayablePosition(shop.shopInternalId)).toEqual(positionBeforeOrder);
  });

  it('Records a refund issued outside the app against the Order that paid the intent', async () => {
    const shop = externalRefundShop;
    const order = await placeAndPayCardOrder(shop);
    const paymentIntentId = await readOrderPaymentIntentId(order.orderPublicId);
    expect(await countRefundFacts(order)).toBe(0);

    const providerRefundId = `re_external_${randomUUID()}`;

    // Nobody in the app asked for this refund: the provider reports one that
    // was issued in its own dashboard, so no fact exists to match.
    await deliverExternalRefundEvent({
      providerRefundId,
      paymentIntentId,
      status: 'succeeded',
      amountMinor: order.paidTotalMinor,
    });
    await pumpFinance();

    const refund = await readLatestRefundFact(order);
    expect(await countRefundFacts(order)).toBe(1);
    expect(refund).toMatchObject({
      status: 'succeeded',
      amount_minor: order.paidTotalMinor,
      refunded_amount_minor: order.paidTotalMinor,
      provider_refund_id: providerRefundId,
    });

    const refundKey = `order.refund:${order.orderInternalId}:${refund.id}`;
    expect(await countJournalEntries(refundKey)).toBe(1);
    expect(await sumPostingsForEntry(refundKey)).toBe(0);
    expect(await sumPostingsByKindForEntry(refundKey, 'seller_payable')).toBe(-2849);
    expect(await sumPostingsByKindForEntry(refundKey, 'platform_clearing')).toBe(3099);

    // The Order's whole contribution is reversed, leaving the position zero.
    expect(await sumSellerPayablePostingsForOrder(order)).toBe(0);
    expect(await readPayablePosition(shop.shopInternalId)).toMatchObject({
      currency: 'USD',
      available_minor: 0,
      not_yet_available_minor: 0,
    });
  });

  it('A full refund reverses the original settled amount when per-part FX rounding differs', async () => {
    const shop = fxFullRefundShop;
    await seedExchangeRate('USD', 'EUR', '1.0000');
    await seedExchangeRate('EUR', 'USD', '1.0005');
    await setBuyerCurrency(shop, { region: 'United States', language: 'en', currency: 'EUR' });

    const order = await placeAndPayCardOrder(shop);
    const orderRow = await readOrderMoneyRow(order.orderPublicId);
    const paidEntry = await readJournalEntry(order.moneyEventKey);

    expect(orderRow.currency).toBe('EUR');
    expect(paidEntry).toMatchObject({
      currency: 'USD',
      charge_currency: 'EUR',
      fx_rate: '1.0005000000',
    });

    // The paid entry rounded the item subtotal and the shipping charge apart;
    // converting the combined charge once would land on a different amount.
    const rate = 1.0005;
    const convertedSubtotalMinor = Math.round(orderRow.subtotal_minor * rate);
    const convertedShippingMinor = Math.round(orderRow.shipping_minor * rate);
    const partsConverted = convertedSubtotalMinor + convertedShippingMinor;
    const combinedConverted = Math.round(orderRow.total_minor * rate);
    const originalCollectedMinor = -await sumPostingsByKindForEntry(
      order.moneyEventKey,
      'platform_clearing',
    );
    expect(originalCollectedMinor).toBe(partsConverted);
    expect(partsConverted).not.toBe(combinedConverted);

    await cancelOrder(shop, order);
    const fullRefund = await adminRefund(order, { action: 'mark_succeeded' });
    expect(fullRefund.status).toBe(200);
    await pumpFinance();

    // A full refund returns the settled amount in full, not a re-rounding of
    // the combined charge, so the Order's contribution is exactly zero.
    expect(await sumSellerPayablePostingsForOrder(order)).toBe(0);
    expect(await readPayablePosition(shop.shopInternalId)).toMatchObject({
      currency: 'USD',
      available_minor: 0,
      not_yet_available_minor: 0,
    });
  });

  it('A refund of an Order recorded before a Settlement Currency change converts through the Cutover Rate', async () => {
    const shop = cutoverShop;
    const order = await placeAndPayCardOrder(shop);

    // The currency change (a separate ticket) is allowed only at a zero
    // position; zeroing the row here is exactly what a Payout would leave.
    await sql.query(
      `update "seller_payable_balances"
       set "available_balance_minor" = 0, "pending_balance_minor" = 0
       where "shop_id" = $1`,
      [shop.shopInternalId],
    );

    const cutoverAt = new Date(Date.now() + 1000);
    await sql.query(
      `update "settlement_currency_history"
       set "effective_to" = $2
       where "shop_id" = $1 and "effective_to" is null`,
      [shop.shopInternalId, cutoverAt],
    );
    await sql.query(
      `insert into "settlement_currency_history"
         ("id", "created_at", "updated_at", "shop_id", "currency",
          "effective_from", "effective_to", "previous_currency", "cutover_rate")
       values ($1, now(), now(), $2, 'EUR', $3, null, 'USD', '0.9')`,
      [randomUUID(), shop.shopInternalId, cutoverAt],
    );

    await cancelOrder(shop, order);

    const fullRefund = await adminRefund(order, { action: 'mark_succeeded' });
    expect(fullRefund.status).toBe(200);
    await pumpFinance();

    const refund = await readLatestRefundFact(order);
    const refundKey = `order.refund:${order.orderInternalId}:${refund.id}`;

    // The Order was charged in USD and settles now in EUR at the recorded 0.9
    // Cutover Rate: 3099 USD -> 2789 EUR, 250 commission -> 225 EUR.
    expect(await readJournalEntry(refundKey)).toMatchObject({
      currency: 'EUR',
      charge_currency: 'USD',
      charge_amount_minor: 3099,
    });
    expect(await sumPostingsForEntry(refundKey)).toBe(0);
    expect(await sumPostingsByKindForEntry(refundKey, 'seller_payable')).toBe(-2564);
    expect(await sumPostingsByKindForEntry(refundKey, 'platform_commission')).toBe(-225);
    expect(await sumPostingsByKindForEntry(refundKey, 'platform_clearing')).toBe(2789);

    expect(await readPayablePosition(shop.shopInternalId)).toMatchObject({
      currency: 'EUR',
      available_minor: 0,
      not_yet_available_minor: -2564,
    });
  });
});
