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
import { OrderRefundService } from '~/domains/order/app/services/order-refund.service';
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

type OrderRow = {
  id: string;
  status: string;
  currency: string;
  total_minor: number;
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
 * webhook signature seams only; the Order's paid state, its outbox rows, and
 * Finance's ledger all move through the real application.
 */
type RefundResult = {
  id: string;
  status: string;
  amount: number;
  failureReason?: string;
};

class FakePaymentGateway extends PaymentGateway {
  readonly refundCalls: string[] = [];
  readonly refunds = new Map<string, RefundResult>();
  private nextEvent: PaymentWebhookEvent | null = null;
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

  async createRefund(paymentIntentId: string): Promise<RefundResult> {
    this.refundCalls.push(paymentIntentId);

    const refund: RefundResult = {
      id: `re_test_${randomUUID()}`,
      status: 'succeeded',
      amount: this.chargeAmountsMinor.get(paymentIntentId) ?? 0,
    };

    this.refunds.set(refund.id, refund);

    return refund;
  }

  async retrieveRefund(refundId: string): Promise<RefundResult> {
    const refund = this.refunds.get(refundId);

    if (!refund) {
      throw new Error(`No refund ${refundId} on this gateway`);
    }

    return refund;
  }

  async retrieveBalanceTransaction(reference: string): Promise<never> {
    throw new Error(`No balance transaction ${reference} on this gateway`);
  }
}

// eslint-disable-next-line max-lines-per-function
describe('Inline booking of an Order Refund (integration)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: TestDatabase;
  let storageRoot: string;
  let sql: Client;
  let gateway: FakePaymentGateway;
  let categoryId: string | undefined;

  let seller: TestSeller;
  let shopInternalId: string;
  let buyer: TestBuyer;
  let inventoryId: string;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase('finance_refund_inline_booking');
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
    // The whole point of this suite: book paid-Order consequences inside the
    // producer's transaction. Must be set before AppModule/config is loaded.
    process.env.FINANCE_MONEY_EVENT_BOOKING = 'inline';

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

    seller = await registerSeller('inline-owner');
    shopInternalId = await resolveShopId(sql, seller.shopPublicId);
    const profile = await createActiveProfile(seller);
    const product = await createPublishableProduct({
      seller,
      shippingProfileId: profile.id,
      title: 'Inline Ledger Mug',
      sku: `FIN-INLINE-${randomUUID()}`,
      amountMinor: 2500,
      stock: 25,
    });
    inventoryId = product.inventoryId;
    buyer = await registerBuyer('inline-buyer');
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
        shop_name: `inl${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`,
        currency,
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
      .send({ name: 'Inline ledger', rank: 1 })
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
        description: 'Inline booking product',
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

  async function confirmCardOrder(target: TestBuyer, quoteId: string) {
    return target.agent
      .post(`${API_PREFIX}/me/checkout`)
      .set('Idempotency-Key', randomUUID())
      .send({ quote_id: quoteId, payment_type: 'card' });
  }

  async function readOrderRow(orderPublicId: string): Promise<OrderRow> {
    const result = await sql.query(
      `select "id", "status", "currency", "total_minor"
       from "orders" where "public_id" = $1`,
      [orderPublicId],
    );

    const row = result.rows[0] as OrderRow | undefined;

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

  async function completeCardSession(
    sessionId: string,
    amountMinor: number,
    expectedStatus = 201,
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
      .expect(expectedStatus);
  }

  async function countJournalEntries(moneyEventKey: string): Promise<number> {
    const result = await sql.query(
      'select count(*)::int as "count" from "journal_entries" where "money_event_key" = $1',
      [moneyEventKey],
    );

    return result.rows[0].count as number;
  }

  async function readPayablePosition(
    internalShopId: string,
  ): Promise<{
    currency: string;
    available_balance_minor: number;
    pending_balance_minor: number;
  } | undefined> {
    const result = await sql.query(
      `select "currency", "available_balance_minor", "pending_balance_minor"
       from "seller_payable_balances"
       where "shop_id" = $1`,
      [internalShopId],
    );

    return result.rows[0];
  }

  async function readRefundedOutboxRows(
    orderInternalId: string,
  ): Promise<Array<{ id: string; status: string }>> {
    const result = await sql.query(
      `select "id", "status"
       from "outbox_events"
       where "event_name" = 'order.refunded'
         and "payload" ->> 'orderId' = $1
       order by "created_at" asc`,
      [orderInternalId],
    );

    return result.rows as Array<{ id: string; status: string }>;
  }

  async function readLatestRefundFact(orderInternalId: string): Promise<{
    id: string;
    status: string;
    amount_minor: number;
    refunded_amount_minor: number | null;
    provider_refund_id: string | null;
  }> {
    const result = await sql.query(
      `select "id", "status", "amount_minor", "refunded_amount_minor", "provider_refund_id"
       from "order_refunds"
       where "order_id" = $1
       order by "requested_at" desc, "created_at" desc
       limit 1`,
      [orderInternalId],
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error(`Order ${orderInternalId} has no refund fact`);
    }

    return row;
  }

  async function cancelOrder(orderPublicId: string): Promise<void> {
    await buyer.agent
      .patch(`${API_PREFIX}/me/orders/${orderPublicId}/cancel-request`)
      .send({ cancel_reason: 'Refund inline scenario' })
      .expect(200);
  }

  async function processRefund(orderInternalId: string): Promise<void> {
    await app.get(OrderRefundService).processRefund(orderInternalId);
  }

  /** Delivers the provider's own report of the refund, which settles it. */
  async function deliverRefundEvent(
    paymentIntentId: string,
    expectedStatus = 201,
  ): Promise<void> {
    const refund = [...gateway.refunds.values()].at(-1);

    if (!refund) {
      throw new Error('FakePaymentGateway has created no refund');
    }

    gateway.queueEvent({
      id: `evt_${randomUUID()}`,
      type: 'refund.updated',
      data: {
        object: {
          id: refund.id,
          paymentIntentId,
          status: refund.status,
          amount: refund.amount,
        },
      },
    });

    await request(app.getHttpServer())
      .post(`${API_PREFIX}/webhooks/stripe`)
      .send({ type: 'refund.updated' })
      .expect(expectedStatus);
  }

  it('Books the refund inline: Journal Entry, payable debit and a processed outbox row', async () => {
    await addCartItem(buyer, inventoryId, 1);
    const quote = await createQuote(buyer);

    const orderResponse = await confirmCardOrder(buyer, quote.quote_id);
    expect(orderResponse.status).toBe(201);

    const orderPublicId = orderResponse.body.order_shops[0].id as string;
    const checkoutSessionId = await readOrderSessionId(orderPublicId);
    const expectedOrder = await readOrderRow(orderPublicId);

    // The paid booking also happens inline, without pumping the worker.
    await completeCardSession(checkoutSessionId, expectedOrder.total_minor);

    const orderRow = await readOrderRow(orderPublicId);
    expect(orderRow.status).toBe('paid');
    expect(await countJournalEntries(`order.paid:${orderRow.id}`)).toBe(1);
    expect(await readPayablePosition(shopInternalId)).toEqual(
      expect.objectContaining({ currency: 'USD', available_balance_minor: 0 }),
    );
    expect((await readPayablePosition(shopInternalId))!.pending_balance_minor)
      .toBe(orderRow.total_minor);

    await cancelOrder(orderPublicId);
    const positionBeforeRefund = await readPayablePosition(shopInternalId);

    await processRefund(orderRow.id);
    const paymentIntentId = gateway.refundCalls.at(-1)!;
    const pendingRefund = await readLatestRefundFact(orderRow.id);

    // Creation only acknowledges the request: no money event, no entry yet.
    expect(pendingRefund.status).toBe('pending');
    expect(await readRefundedOutboxRows(orderRow.id)).toHaveLength(0);
    expect(await countJournalEntries(
      `order.refund:${orderRow.id}:${pendingRefund.id}`,
    )).toBe(0);

    // The provider's event settles it and the inline booking must have run
    // inside that webhook transaction, with no Finance worker pump.
    await deliverRefundEvent(paymentIntentId);

    const refund = await readLatestRefundFact(orderRow.id);
    expect(refund).toMatchObject({
      status: 'succeeded',
      amount_minor: orderRow.total_minor,
      refunded_amount_minor: orderRow.total_minor,
    });

    const refundKey = `order.refund:${orderRow.id}:${refund.id}`;
    expect(await countJournalEntries(refundKey)).toBe(1);

    const afterRefund = await readPayablePosition(shopInternalId);
    expect(afterRefund).toEqual(expect.objectContaining({
      currency: 'USD',
      available_balance_minor: 0,
    }));
    // The refunded Order's contribution comes out of the bucket it sat in.
    expect(afterRefund!.pending_balance_minor).toBe(0);
    expect(afterRefund!.pending_balance_minor)
      .toBeLessThan(positionBeforeRefund!.pending_balance_minor);

    const outboxRows = await readRefundedOutboxRows(orderRow.id);
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0].status).toBe('processed');

    // Replaying the same provider event changes nothing.
    await deliverRefundEvent(paymentIntentId);

    expect(await countJournalEntries(refundKey)).toBe(1);
    expect(await readPayablePosition(shopInternalId)).toEqual(afterRefund);
    expect(await readRefundedOutboxRows(orderRow.id)).toHaveLength(1);
  });

  it('Rolls the refund back when the inline booking refuses the event', async () => {
    await addCartItem(buyer, inventoryId, 1);
    const quote = await createQuote(buyer);

    const orderResponse = await confirmCardOrder(buyer, quote.quote_id);
    expect(orderResponse.status).toBe(201);

    const orderPublicId = orderResponse.body.order_shops[0].id as string;
    const checkoutSessionId = await readOrderSessionId(orderPublicId);
    const expectedOrder = await readOrderRow(orderPublicId);
    await completeCardSession(checkoutSessionId, expectedOrder.total_minor);

    const orderRow = await readOrderRow(orderPublicId);
    await cancelOrder(orderPublicId);
    const positionBeforeRefund = await readPayablePosition(shopInternalId);

    await processRefund(orderRow.id);
    const paymentIntentId = gateway.refundCalls.at(-1)!;
    const pendingRefund = await readLatestRefundFact(orderRow.id);

    // A refund is expressed in the currency the buyer paid; changing the Order
    // currency makes the booking refuse the event inside the webhook.
    await sql.query(
      'update "orders" set "currency" = \'EUR\', "updated_at" = now() where "id" = $1',
      [orderRow.id],
    );

    await deliverRefundEvent(paymentIntentId, 500);

    // The failed booking rolled the refund state change back: the fact stays
    // pending, no money event survives, and the balance did not move.
    expect((await readLatestRefundFact(orderRow.id)).status).toBe('pending');
    expect(await countJournalEntries(
      `order.refund:${orderRow.id}:${pendingRefund.id}`,
    )).toBe(0);
    expect(await readRefundedOutboxRows(orderRow.id)).toHaveLength(0);
    expect(await readPayablePosition(shopInternalId)).toEqual(positionBeforeRefund);
  });
});
