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
import {
  PayoutGateway,
  type PayoutTransferInput,
  type PayoutTransferResult,
} from '~/integrations/payment/app/ports/payout-gateway';
import { ObservabilityService } from '~/platform/observability/observability.service';
import { RequestContextService } from '~/platform/request-context/request-context.service';
import { FinanceMoneyEventProcessorService } from '~/domains/finance/app/services/finance-money-event-processor.service';
import { RunPayoutsUseCase } from '~/domains/finance/app/use-cases/run-payouts/run-payouts.use-case';
import { createTestDatabase, dropTestDatabase } from '../support/test-postgres';
import type { TestDatabaseContext } from '../support/test-postgres';
import { seedAuthReferenceData } from '../../database/seeds/auth.seed';
import { resolveShopId, seedPublishableInventory } from '../support/shipping-fixtures';

jest.setTimeout(240_000);

const API_PREFIX = '/v1';
const VALID_TEST_PASSWORD = 'Password123!';
const ACCOUNT_REFERENCE = '0123456789';

type TestDatabase = TestDatabaseContext;

type TestAgent = { agent: Agent; email: string; userId: string };
type TestSeller = TestAgent & { shopId: string; shopPublicId: string };
type TestBuyer = TestAgent & { addressId: string };

type ShippingQuoteResponse = {
  quote_id: string;
  checkout_currency: string;
  total_minor: number;
  shops: Array<{ shop_id: string }>;
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

type PaidOrder = {
  orderInternalId: string;
  orderPublicId: string;
  checkoutSessionId: string;
  currency: string;
  creditMinor: number;
};

type Shipment = { id: string };
type Group = { id: string; shipments: Shipment[] };
type Fulfillment = { groups: Group[] };

type PayoutRow = {
  id: string;
  public_id: string;
  shop_id: string;
  payout_account_id: string;
  currency: string;
  amount_minor: number;
  state: string;
  provider_reference: string | null;
  attempt_count: number;
  run_day: string;
  paid_at: string | null;
};

type PayoutLineRow = {
  payout_id: string;
  order_id: string;
  amount_minor: number;
};

type PostingRow = { kind: string; amount_minor: number };

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

class NoopJobDispatcher extends JobDispatcher {
  async dispatch<TName extends AppJobName>(
    _name: TName,
    _payload: AppJobPayloadMap[TName],
    _options?: DispatchJobOptions,
  ): Promise<void> {}
}

class FakePaymentGateway extends PaymentGateway {
  private nextEvent: PaymentWebhookEvent | null = null;

  queueEvent(event: PaymentWebhookEvent): void {
    this.nextEvent = event;
  }

  async createCheckoutSession(_input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult> {
    const id = `cs_test_${randomUUID().replace(/-/g, '')}`;

    return { id, url: `https://pay.test/${id}`, expiresAt: new Date(Date.now() + 3_600_000) };
  }

  constructWebhookEvent(_payload: Buffer, _signature?: string): PaymentWebhookEvent {
    if (!this.nextEvent) {
      throw new Error('No webhook event queued on FakePaymentGateway');
    }

    const event = this.nextEvent;
    this.nextEvent = null;

    return event;
  }

  async retrieveCheckoutSession(sessionId: string) {
    return { id: sessionId, status: 'complete', paymentStatus: 'paid' };
  }

  async createRefund() {
    return { id: 're_test', status: 'succeeded', amount: 0 };
  }
}

/**
 * The payout provider double: it stands in for the transfer seam only and hands
 * back its own reference, so the suite can prove the reference on the Payout
 * came from the port rather than from Arc.
 */
class FakePayoutGateway extends PayoutGateway {
  readonly calls: PayoutTransferInput[] = [];

  async send(input: PayoutTransferInput): Promise<PayoutTransferResult> {
    this.calls.push(input);

    return { reference: `mb_transfer_${this.calls.length}` };
  }
}

// eslint-disable-next-line max-lines-per-function
describe('Payout Run pays available balances (integration)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: TestDatabase;
  let storageRoot: string;
  let sql: Client;
  let payoutGateway: FakePayoutGateway;
  let admin: TestAgent;
  let categoryId: string | undefined;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase('finance_payout_run');
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-payout-run-int-'));
    payoutGateway = new FakePayoutGateway();

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
      .useValue(new FakePaymentGateway())
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

    admin = await registerAgent('payout-admin', 'Admin');
    await assignRole(admin.userId, 'admin');
  });

  // The provider double lives for the whole suite, so clear the calls it has
  // recorded before each test: each test then asserts on the provider calls its
  // own run caused, rather than on every call the suite has made so far.
  beforeEach(() => {
    payoutGateway.calls.length = 0;
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

    const response = await agent
      .post(`${API_PREFIX}/auth/register`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', randomForwardedIp())
      .send({ email, password: VALID_TEST_PASSWORD, displayName })
      .expect(201);

    return { agent, email, userId: response.body.user.id as string };
  }

  async function assignRole(userId: string, roleKey: 'admin' | 'seller'): Promise<void> {
    const role = await sql.query('select "id" from "roles" where "key" = $1', [roleKey]);
    await sql.query(
      `insert into "user_roles" ("id", "created_at", "updated_at", "assigned_at", "user_id", "role_id")
       values ($1, now(), now(), now(), $2, $3)`,
      [randomUUID(), userId, role.rows[0].id],
    );
  }

  async function registerSeller(prefix: string): Promise<TestSeller> {
    const created = await registerAgent(prefix, 'Seller');
    await assignRole(created.userId, 'seller');

    const response = await created.agent
      .post(`${API_PREFIX}/shops`)
      .set('Idempotency-Key', randomUUID())
      .send({
        shop_name: `pay${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`,
        currency: 'USD',
      })
      .expect(201);

    return {
      ...created,
      shopId: await resolveShopId(sql, response.body.id as string),
      shopPublicId: response.body.id as string,
    };
  }

  async function registerBuyer(prefix: string): Promise<TestBuyer> {
    const created = await registerAgent(prefix, 'Buyer');

    const addressResponse = await created.agent
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

    return { ...created, addressId: addressResponse.body.address.id as string };
  }

  async function seedCategory(agent: Agent): Promise<string> {
    if (categoryId) {
      return categoryId;
    }

    const response = await agent
      .post(`${API_PREFIX}/categories`)
      .set('Idempotency-Key', randomUUID())
      .send({ name: 'Payout run', rank: 1 })
      .expect(201);

    categoryId = response.body.id as string;

    return categoryId;
  }

  async function createActiveProfile(owner: TestSeller): Promise<string> {
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

    return response.body.id as string;
  }

  async function createPublishableProduct(input: {
    seller: TestSeller;
    shippingProfileId: string;
    title: string;
    sku: string;
    amountMinor: number;
    stock: number;
  }): Promise<string> {
    const productResponse = await input.seller.agent
      .post(`${API_PREFIX}/shops/${input.seller.shopPublicId}/products`)
      .set('Idempotency-Key', randomUUID())
      .send({
        category_id: await seedCategory(input.seller.agent),
        title: input.title,
        description: 'Payout run product',
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
      shopId: input.seller.shopPublicId,
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

    return inventoryId;
  }

  /** One fresh shop with a single publishable, in-stock Product. */
  async function createShopWithProduct(
    prefix: string,
    options: { amountMinor: number; stock: number },
  ): Promise<{ seller: TestSeller; inventoryId: string }> {
    const seller = await registerSeller(prefix);
    const profileId = await createActiveProfile(seller);
    const inventoryId = await createPublishableProduct({
      seller,
      shippingProfileId: profileId,
      title: `${prefix} mug`,
      sku: `${prefix.toUpperCase()}-${randomUUID()}`,
      amountMinor: options.amountMinor,
      stock: options.stock,
    });

    return { seller, inventoryId };
  }

  async function placeAndPayCardOrder(
    buyer: TestBuyer,
    inventoryId: string,
    quantity: number,
  ): Promise<PaidOrder> {
    await buyer.agent
      .post(`${API_PREFIX}/cart/items`)
      .set('Idempotency-Key', randomUUID())
      .send({ inventory_id: inventoryId, quantity })
      .expect(201);

    const quoteResponse = await buyer.agent
      .post(`${API_PREFIX}/me/checkout/quote`)
      .set('Idempotency-Key', randomUUID())
      .send({ user_address_id: buyer.addressId })
      .expect(201);
    const quote = quoteResponse.body as ShippingQuoteResponse;

    const orderResponse = await buyer.agent
      .post(`${API_PREFIX}/me/checkout`)
      .set('Idempotency-Key', randomUUID())
      .send({ quote_id: quote.quote_id, payment_type: 'card' })
      .expect(201);
    const orderPublicId = orderResponse.body.order_shops[0].id as string;

    const session = await sql.query(
      `select "payment_details" ->> 'checkout_session_id' as "session_id"
       from "orders" where "public_id" = $1`,
      [orderPublicId],
    );
    const checkoutSessionId = session.rows[0].session_id as string;

    const gateway = app.get(PaymentGateway) as FakePaymentGateway;
    gateway.queueEvent({
      id: `evt_${randomUUID()}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: checkoutSessionId,
          paymentStatus: 'paid',
          paymentIntentId: `pi_${randomUUID()}`,
        },
      },
    });

    await request(app.getHttpServer())
      .post(`${API_PREFIX}/webhooks/stripe`)
      .send({ type: 'checkout.session.completed' })
      .expect(201);

    await app.get(FinanceMoneyEventProcessorService).processPendingEvents();

    const row = (await sql.query(
      `select "id", "currency", "subtotal_minor", "shipping_minor", "discount_minor", "total_minor"
       from "orders" where "public_id" = $1`,
      [orderPublicId],
    )).rows[0] as OrderMoneyRow;

    return {
      orderInternalId: row.id,
      orderPublicId,
      checkoutSessionId,
      currency: row.currency,
      creditMinor: row.subtotal_minor - row.discount_minor + row.shipping_minor,
    };
  }

  /** Ships and delivers the Order's only item, then lets Finance record availability. */
  async function deliverOrder(seller: TestSeller, order: PaidOrder): Promise<void> {
    const item = (await sql.query(
      'select "id" from "order_items" where "order_id" = $1 limit 1',
      [order.orderInternalId],
    )).rows[0] as { id: string };

    const prepared = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments`)
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ order_item_id: item.id, quantity: 1 }],
        carrier: 'USPS',
        tracking_number: `TRACK-${randomUUID().slice(0, 8)}`,
      })
      .expect(201);
    const shipmentId = (prepared.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!.id;

    for (const status of ['dispatched', 'delivered']) {
      await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments/${shipmentId}/journey`)
        .set('Idempotency-Key', randomUUID())
        .send({ status })
        .expect(201);
    }

    await app.get(FinanceMoneyEventProcessorService).processPendingEvents();
  }

  /** Records the seller's Payout Account and, unless asked otherwise, verifies it. */
  async function recordPayoutAccount(
    seller: TestSeller,
    options: { verify: boolean } = { verify: true },
  ): Promise<string> {
    const response = await seller.agent
      .put(`${API_PREFIX}/shops/${seller.shopPublicId}/finance/payout-account`)
      .set('Idempotency-Key', randomUUID())
      .send({
        type: 'bank',
        holder_name: 'Jane Seller',
        bank_name: 'Example Bank',
        country: 'US',
        account_reference: ACCOUNT_REFERENCE,
      })
      .expect(200);

    const accountId = response.body.payout_account.id as string;

    if (options.verify) {
      await admin.agent
        .put(`${API_PREFIX}/admin/shops/${seller.shopPublicId}/finance/payout-account/verification`)
        .set('Idempotency-Key', randomUUID())
        .send({ status: 'active' })
        .expect(200);
    }

    return accountId;
  }

  async function runPayouts() {
    return app.get(RunPayoutsUseCase).execute();
  }

  async function readPayouts(shopId: string): Promise<PayoutRow[]> {
    return (await sql.query(
      `select "id", "public_id", "shop_id", "payout_account_id", "currency",
              "amount_minor", "state", "provider_reference", "attempt_count",
              "run_day"::text as "run_day", "paid_at"
       from "payouts" where "shop_id" = $1 order by "created_at" asc`,
      [shopId],
    )).rows as PayoutRow[];
  }

  async function readPayoutLines(payoutId: string): Promise<PayoutLineRow[]> {
    return (await sql.query(
      'select "payout_id", "order_id", "amount_minor" from "payout_lines" where "payout_id" = $1',
      [payoutId],
    )).rows as PayoutLineRow[];
  }

  async function readPayoutPostings(payoutId: string): Promise<PostingRow[]> {
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

  async function readPayablePosition(shopId: string): Promise<PayablePosition | undefined> {
    return (await sql.query(
      `select "currency", "available_minor", "not_yet_available_minor"
       from "seller_payable_positions" where "shop_id" = $1`,
      [shopId],
    )).rows[0] as PayablePosition | undefined;
  }

  async function readPayoutHistory(
    seller: TestSeller,
  ): Promise<{ payouts: Array<Record<string, unknown>> }> {
    const response = await seller.agent
      .get(`${API_PREFIX}/shops/${seller.shopPublicId}/finance/payouts`)
      .expect(200);

    return response.body as { payouts: Array<Record<string, unknown>> };
  }

  it('pays the available balance once, discharging it per Order and leaving a readable history', async () => {
    const { seller, inventoryId } = await createShopWithProduct('run-full', {
      amountMinor: 4_000,
      stock: 5,
    });
    const buyer = await registerBuyer('run-full-buyer');
    const order = await placeAndPayCardOrder(buyer, inventoryId, 1);
    await deliverOrder(seller, order);
    const accountId = await recordPayoutAccount(seller);

    const before = await readPayablePosition(seller.shopId);
    expect(before).toMatchObject({
      currency: 'USD',
      available_minor: order.creditMinor,
      not_yet_available_minor: 0,
    });

    const summary = await runPayouts();
    expect(summary).toMatchObject({ paidShopCount: 1 });

    const payouts = await readPayouts(seller.shopId);
    expect(payouts).toHaveLength(1);
    expect(payouts[0]).toMatchObject({
      shop_id: seller.shopId,
      payout_account_id: accountId,
      currency: 'USD',
      amount_minor: order.creditMinor,
      state: 'paid',
      provider_reference: 'mb_transfer_1',
      attempt_count: 1,
      run_day: new Date().toISOString().slice(0, 10),
    });
    expect(payouts[0]!.paid_at).not.toBeNull();

    // The discharge is explainable Order by Order.
    const lines = await readPayoutLines(payouts[0]!.id);
    expect(lines).toEqual([
      {
        payout_id: payouts[0]!.id,
        order_id: order.orderInternalId,
        amount_minor: order.creditMinor,
      },
    ]);

    // The ledger entry reduces Seller Payable by exactly what was paid and balances.
    const postings = await readPayoutPostings(payouts[0]!.id);
    expect(postings).toEqual([
      { kind: 'seller_payable', amount_minor: -order.creditMinor },
      { kind: 'platform_clearing', amount_minor: order.creditMinor },
    ]);

    // The projected available figure drops; nothing else moves.
    const after = await readPayablePosition(seller.shopId);
    expect(after).toMatchObject({
      currency: 'USD',
      available_minor: 0,
      not_yet_available_minor: 0,
    });

    // The provider received the shop's own account reference and settlement currency.
    expect(payoutGateway.calls).toHaveLength(1);
    expect(payoutGateway.calls[0]).toMatchObject({
      payoutPublicId: payouts[0]!.public_id,
      provider: 'manual_bank',
      amountMinor: order.creditMinor,
      currency: 'USD',
      destination: {
        holderName: 'Jane Seller',
        bankName: 'Example Bank',
        country: 'US',
        last4: '6789',
        reference: ACCOUNT_REFERENCE,
      },
    });

    const history = await readPayoutHistory(seller);
    expect(history.payouts).toHaveLength(1);
    expect(history.payouts[0]).toMatchObject({
      id: payouts[0]!.public_id,
      amount_minor: order.creditMinor,
      currency: 'USD',
      state: 'paid',
    });

    // Re-running the same platform day pays nothing and calls no provider.
    const rerun = await runPayouts();
    expect(rerun.paidShopCount).toBe(0);
    expect(payoutGateway.calls).toHaveLength(1);
    expect(await readPayouts(seller.shopId)).toHaveLength(1);
    expect(await readPayablePosition(seller.shopId)).toMatchObject({ available_minor: 0 });
  });

  it('pays only recorded availability and never the not-yet-available remainder', async () => {
    const { seller, inventoryId } = await createShopWithProduct('run-partial', {
      amountMinor: 3_000,
      stock: 6,
    });
    const buyer = await registerBuyer('run-partial-buyer');
    const deliveredOrder = await placeAndPayCardOrder(buyer, inventoryId, 1);
    const undeliveredOrder = await placeAndPayCardOrder(buyer, inventoryId, 1);
    await deliverOrder(seller, deliveredOrder);
    await recordPayoutAccount(seller);

    const before = await readPayablePosition(seller.shopId);
    expect(before).toMatchObject({
      available_minor: deliveredOrder.creditMinor,
      not_yet_available_minor: undeliveredOrder.creditMinor,
    });

    await runPayouts();

    const payouts = await readPayouts(seller.shopId);
    expect(payouts).toHaveLength(1);
    expect(payouts[0]!.amount_minor).toBe(deliveredOrder.creditMinor);

    const lines = await readPayoutLines(payouts[0]!.id);
    expect(lines.map((line) => line.order_id)).toEqual([deliveredOrder.orderInternalId]);

    const after = await readPayablePosition(seller.shopId);
    expect(after).toMatchObject({
      available_minor: 0,
      not_yet_available_minor: undeliveredOrder.creditMinor,
    });
  });

  it('does not pay a shop whose Payout Account an operator has not verified', async () => {
    const { seller, inventoryId } = await createShopWithProduct('run-unverified', {
      amountMinor: 2_500,
      stock: 4,
    });
    const buyer = await registerBuyer('run-unverified-buyer');
    const order = await placeAndPayCardOrder(buyer, inventoryId, 1);
    await deliverOrder(seller, order);
    await recordPayoutAccount(seller, { verify: false });

    await runPayouts();

    expect(await readPayouts(seller.shopId)).toHaveLength(0);
    expect(payoutGateway.calls).toHaveLength(0);
    expect(await readPayablePosition(seller.shopId)).toMatchObject({
      available_minor: order.creditMinor,
    });
    expect((await readPayoutHistory(seller)).payouts).toHaveLength(0);
  });

  it('does not claim a new Payout while an earlier one is still pending', async () => {
    const { seller, inventoryId } = await createShopWithProduct('run-pending', {
      amountMinor: 3_500,
      stock: 3,
    });
    const buyer = await registerBuyer('run-pending-buyer');
    const order = await placeAndPayCardOrder(buyer, inventoryId, 1);
    await deliverOrder(seller, order);
    const accountId = await recordPayoutAccount(seller);

    const before = await readPayablePosition(seller.shopId);
    expect(before).toMatchObject({
      currency: 'USD',
      available_minor: order.creditMinor,
      not_yet_available_minor: 0,
    });

    // A run that scanned before UTC midnight claimed this shop's Payout and its
    // provider transfer is still unresolved: the row stays pending on an
    // earlier platform day.
    const pendingPayoutId = randomUUID();
    await sql.query(
      `insert into "payouts" (
         "id", "created_at", "updated_at", "public_id", "shop_id", "payout_account_id",
         "currency", "amount_minor", "state", "provider_reference", "attempt_count",
         "run_day", "paid_at"
       )
       values ($1, now(), now(), $2, $3, $4, 'USD', $5, 'pending', null, 1,
               (now() at time zone 'utc')::date - 1, null)`,
      [
        pendingPayoutId,
        `pay_pending_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        seller.shopId,
        accountId,
        order.creditMinor,
      ],
    );

    const summary = await runPayouts();
    expect(summary.paidShopCount).toBe(0);

    // The pending claim blocks a second Payout, its provider call, and the
    // discharge even though the new run belongs to a later platform day.
    const payouts = await readPayouts(seller.shopId);
    expect(payouts).toHaveLength(1);
    expect(payouts[0]).toMatchObject({
      id: pendingPayoutId,
      state: 'pending',
      amount_minor: order.creditMinor,
      provider_reference: null,
    });
    expect(payouts[0]!.run_day).not.toBe(new Date().toISOString().slice(0, 10));
    expect(payoutGateway.calls).toHaveLength(0);
    expect(await readPayablePosition(seller.shopId)).toMatchObject({
      currency: 'USD',
      available_minor: order.creditMinor,
      not_yet_available_minor: 0,
    });
  });
});
