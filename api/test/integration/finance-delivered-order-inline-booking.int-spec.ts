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

type AvailabilityRow = {
  currency: string;
  amount_minor: number;
  evidence: Array<{ shipmentId: string; shipmentPublicId: string }>;
};

type OutboxRow = {
  id: string;
  status: string;
  processed_at: string | null;
};

type PayablePosition = {
  currency: string;
  available_balance_minor: number;
  pending_balance_minor: number;
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
 * request. The delivery request itself no longer depends on a dispatcher.
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

  async retrieveBalanceTransaction(reference: string): Promise<never> {
    throw new Error(`No balance transaction ${reference} on this gateway`);
  }
}

// eslint-disable-next-line max-lines-per-function
describe('Inline booking of a delivered Order (integration)', () => {
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
    testDb = await createTestDatabase('finance_delivered_inline');
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-finance-delivered-int-'));
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
    // The whole point of this suite: book the delivered Order's payout
    // availability inside the delivery transaction, with no finance worker.
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

    seller = await registerSeller('delivered-owner');
    shopInternalId = await resolveShopId(sql, seller.shopPublicId);
    const profile = await createActiveProfile(seller);
    const product = await createPublishableProduct({
      seller,
      shippingProfileId: profile.id,
      title: 'Delivered Inline Mug',
      sku: `FIN-DELIVERED-${randomUUID()}`,
      amountMinor: 2500,
      stock: 25,
    });
    inventoryId = product.inventoryId;
    buyer = await registerBuyer('delivered-buyer');
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
        shop_name: `del${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`,
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
      .send({ name: 'Delivered inline', rank: 1 })
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
        description: 'Delivered inline product',
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

  async function completeCardSession(sessionId: string, expectedStatus = 201): Promise<void> {
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
      .expect(expectedStatus);
  }

  function prepareShipment(orderPublicId: string) {
    return seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${orderPublicId}/fulfillment/shipments`)
      .set('Idempotency-Key', randomUUID())
      .send({});
  }

  function journey(
    orderPublicId: string,
    shipmentId: string,
    status: 'dispatched' | 'delivered',
  ) {
    return seller.agent
      .post(
        `${API_PREFIX}/shops/${seller.shopPublicId}/orders/${orderPublicId}/fulfillment/shipments/${shipmentId}/journey`,
      )
      .set('Idempotency-Key', randomUUID())
      .send({ status });
  }

  async function readPayablePosition(
    internalShopId: string,
  ): Promise<PayablePosition | undefined> {
    const result = await sql.query(
      `select "currency", "available_balance_minor", "pending_balance_minor"
       from "seller_payable_balances"
       where "shop_id" = $1`,
      [internalShopId],
    );

    return result.rows[0];
  }

  async function readAvailabilityRows(orderInternalId: string): Promise<AvailabilityRow[]> {
    const result = await sql.query(
      `select "currency", "amount_minor", "evidence"
       from "payout_availabilities"
       where "order_id" = $1`,
      [orderInternalId],
    );

    return result.rows as AvailabilityRow[];
  }

  async function readDeliveredOutboxRows(orderInternalId: string): Promise<OutboxRow[]> {
    const result = await sql.query(
      `select "id", "status", "processed_at"
       from "outbox_events"
       where "event_name" = 'order.delivered' and "aggregate_id" = $1
       order by "created_at" asc`,
      [orderInternalId],
    );

    return result.rows as OutboxRow[];
  }

  it('Books the payout availability inline when the Order is delivered', async () => {
    await addCartItem(buyer, inventoryId, 1);
    const quote = await createQuote(buyer);

    const orderResponse = await confirmCardOrder(buyer, quote.quote_id);
    expect(orderResponse.status).toBe(201);

    const orderPublicId = orderResponse.body.order_shops[0].id as string;
    const checkoutSessionId = await readOrderSessionId(orderPublicId);

    // The paid posting is booked inline too, so pending Seller Payable already
    // equals the Order's net before the delivery.
    await completeCardSession(checkoutSessionId);

    const orderRow = await readOrderRow(orderPublicId);
    expect(orderRow.status).toBe('paid');
    expect(orderRow.currency).toBe('USD');

    const paidPosition = await readPayablePosition(shopInternalId);
    expect(paidPosition).toBeDefined();
    const netMinor = paidPosition!.pending_balance_minor;
    expect(netMinor).toBeGreaterThan(0);

    const prepared = await prepareShipment(orderPublicId).expect(201);
    const shipmentId = prepared.body.fulfillment.groups[0].shipments[0].id as string;
    const ship = prepared.body.fulfillment.groups[0].shipments[0];
    expect(ship.items).toHaveLength(1);

    await journey(orderPublicId, shipmentId, 'dispatched').expect(201);
    await journey(orderPublicId, shipmentId, 'delivered').expect(201);

    // Delivery never advances the Order's commercial status: it stays paid,
    // and the released money is what proves the delivery was booked.
    const deliveredOrder = await readOrderRow(orderPublicId);
    expect(deliveredOrder.status).toBe('paid');

    const availability = await readAvailabilityRows(orderRow.id);
    expect(availability).toHaveLength(1);
    expect(availability[0]).toMatchObject({ currency: 'USD', amount_minor: netMinor });
    expect(availability[0].evidence).toEqual([
      expect.objectContaining({ shipmentPublicId: ship.id }),
    ]);

    const position = await readPayablePosition(shopInternalId);
    expect(position).toEqual({
      currency: 'USD',
      available_balance_minor: netMinor,
      pending_balance_minor: paidPosition!.pending_balance_minor - netMinor,
    });

    const outboxRows = await readDeliveredOutboxRows(orderRow.id);
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0].status).toBe('processed');
    expect(outboxRows[0].processed_at).not.toBeNull();

    // Replaying the same delivery is a no-op: same availability, same balances.
    await journey(orderPublicId, shipmentId, 'delivered').expect(201);

    expect(await readAvailabilityRows(orderRow.id)).toHaveLength(1);
    expect(await readPayablePosition(shopInternalId)).toEqual(position);
    expect(await readDeliveredOutboxRows(orderRow.id)).toHaveLength(1);
  });

  it('Rolls the delivery back when the Order has no paid posting yet', async () => {
    await addCartItem(buyer, inventoryId, 1);
    const quote = await createQuote(buyer);

    const orderResponse = await confirmCardOrder(buyer, quote.quote_id);
    expect(orderResponse.status).toBe(201);

    const orderPublicId = orderResponse.body.order_shops[0].id as string;
    const checkoutSessionId = await readOrderSessionId(orderPublicId);
    await completeCardSession(checkoutSessionId);

    const orderRow = await readOrderRow(orderPublicId);
    const paidPosition = await readPayablePosition(shopInternalId);

    // Make the paid posting look like it is still on its way: the delivery then
    // must fail and stay retryable rather than retiring the payout.
    const moneyEventKey = `order.paid:${orderRow.id}`;
    await sql.query(
      `delete from "postings"
       where "journal_entry_id" in (
         select "id" from "journal_entries" where "money_event_key" = $1
       )`,
      [moneyEventKey],
    );
    await sql.query('delete from "journal_entries" where "money_event_key" = $1', [moneyEventKey]);
    await sql.query(
      `update "outbox_events" set "status" = 'pending', "processed_at" = null
       where "event_name" = 'order.paid' and "aggregate_id" = $1`,
      [orderRow.id],
    );

    const prepared = await prepareShipment(orderPublicId).expect(201);
    const shipmentId = prepared.body.fulfillment.groups[0].shipments[0].id as string;
    await journey(orderPublicId, shipmentId, 'dispatched').expect(201);

    await journey(orderPublicId, shipmentId, 'delivered').expect(500);

    const shipmentRow = await sql.query(
      'select "status", "delivered_at" from "shipments" where "public_id" = $1',
      [shipmentId],
    );
    expect(shipmentRow.rows[0]).toEqual({ status: 'dispatched', delivered_at: null });
    expect(await readAvailabilityRows(orderRow.id)).toHaveLength(0);
    expect(await readDeliveredOutboxRows(orderRow.id)).toHaveLength(0);
    expect(await readPayablePosition(shopInternalId)).toEqual(paidPosition);
  });
});
