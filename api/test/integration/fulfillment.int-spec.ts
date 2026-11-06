import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import os from 'node:os';
import path from 'node:path';
import { EntityManager } from '@mikro-orm/postgresql';
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
import { FulfillmentService } from '~/domains/fulfillment/app/services/fulfillment.service';
import { FinanceMoneyEventProcessorService } from '~/domains/finance/app/services/finance-money-event-processor.service';
import { ShipmentUpdateActorType } from '~/domains/fulfillment/domain/enums/shipment-update-actor-type.enum';
import { ShipmentUpdateSource } from '~/domains/fulfillment/domain/enums/shipment-update-source.enum';
import { PermissionEntity } from '~/domains/auth/infra/persistence/entities/permission.entity';
import { RolePermissionEntity } from '~/domains/auth/infra/persistence/entities/role-permission.entity';
import { RoleEntity } from '~/domains/auth/infra/persistence/entities/role.entity';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import {
  CarrierParcelGateway,
  CarrierLabelAlreadyUsedError,
  CarrierLabelNotFoundError,
  CarrierLabelPurchaseUnavailableError,
  CarrierLabelQuoteRejectedError,
  CarrierLabelRefundUnavailableError,
  CarrierRateQuoteUnavailableError,
} from '~/integrations/carrier/app/ports/carrier-parcel.gateway';
import { LocalFileStorageService } from '~/integrations/storage/infra/local-file-storage.service';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { ObservabilityService } from '~/platform/observability/observability.service';
import { RequestContextService } from '~/platform/request-context/request-context.service';
import { createTestDatabase, dropTestDatabase } from '../support/test-postgres';
import { seedAuthReferenceData } from '../../database/seeds/auth.seed';
import {
  assignProductShippingProfile,
  resolveProductId,
  resolveShopId,
  seedShopShippingProfile,
} from '../support/shipping-fixtures';

jest.setTimeout(60_000);

const API_PREFIX = '/v1';
const VALID_TEST_PASSWORD = 'Password123!';

const CARRIER_WEBHOOK_SECRET = 'test-carrier-secret';

type TestDatabase = {
  dbName: string;
  rootConfig: {
    host: string; port: number; user: string; password: string 
  };
};

type TestSeller = {
  agent: Agent; email: string; shopId: string; shopPublicId: string 
};
type TestBuyer = {
  agent: Agent; email: string; userId: string; addressId: string 
};

type ShipmentItem = { order_item_id: string; quantity: number };
type Shipment = {
  id: string;
  group_id: string;
  status: string;
  carrier?: string;
  carrier_name?: string;
  carrier_observable?: boolean;
  tracking_number?: string;
  shipment_note?: string;
  prepared_at: string;
  dispatched_at?: string;
  delivered_at?: string;
  voided_at?: string;
  items: ShipmentItem[];
  updates: Array<{
    status: string;
    actor_type: string;
    actor_id?: string;
    source: string;
    occurred_at: string;
    note?: string;
    event_code?: string;
    location?: string;
  }>;
  label?: {
    public_id: string;
    service: string;
    status: string;
    price_minor: number;
    currency: string;
  };
};
type Group = {
  id: string;
  method: string;
  operator: string;
  provenance: string;
  items: ShipmentItem[];
  progress: Record<string, number>;
  shipments: Shipment[];
};
type Fulfillment = {
  status: string;
  requires_reconciliation: boolean;
  progress: Record<string, number>;
  groups: Group[];
  legacy_shipping: {
    status: string;
    tracking_number?: string;
    carrier?: string;
    note?: string;
    shipped_at?: string;
    delivered_at?: string;
  };
};

type SeededOrder = {
  orderId: string;
  orderPublicId: string;
  orderItemId: string;
  quantity: number;
};

function randomForwardedIp() {
  // Auth routes keep a per-IP limit; a two-octet pool keeps every test's
  // register/login off a colliding address as the suite grows.
  return `203.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`;
}

// Mirrors the cutover migration's backfill so seeded pre-cutover Orders carry the
// same stored aggregate projection the migration would have produced.
function storedFulfillmentStatus(
  orderStatus: string,
  shippingStatus: string,
): string {
  if (orderStatus === 'canceled') {
    return 'canceled';
  }

  if (shippingStatus === 'in_transit' || shippingStatus === 'shipped') {
    return 'in_transit';
  }

  if (shippingStatus === 'delivered') {
    return 'delivered';
  }

  return 'unfulfilled';
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
}

function createDeferredSignal() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });

  return { promise, resolve };
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
describe('Fulfillment flow (integration)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: TestDatabase;
  let storageRoot: string;
  let sql: Client;
  let fulfillmentService: FulfillmentService;
  let financeMoneyEventProcessor: FinanceMoneyEventProcessorService;

  // Rate quoting is the only gateway call that is not best-effort; the fake
  // keeps parcel registration a no-op and lets a test seed fixed quotes.
  const carrierParcelGateway = {
    registerParcel: jest.fn(async () => undefined),
    signalHandover: jest.fn(async () => undefined),
    quoteRates: jest.fn(),
    purchaseLabel: jest.fn(),
    refundLabel: jest.fn(async () => undefined),
  };

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase('fulfillment');
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-fulfillment-int-'));

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
    // Cookie-authenticated supertest requests need a non-Secure cookie to be
    // stored over plain HTTP.
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.RATE_LIMIT_DRIVER = 'memory';
    // The suite makes many authenticated requests from one address; the limiter is
    // exercised elsewhere, so raise it here to keep the scenarios deterministic.
    process.env.RATE_LIMIT_LIMIT = '10000';
    process.env.QUEUE_DRIVER = 'inline';
    process.env.MAIL_DRIVER = 'logger';
    process.env.STORAGE_DRIVER = 'local';
    process.env.STORAGE_LOCAL_ROOT = storageRoot;
    process.env.CARRIER_WEBHOOK_SECRET = CARRIER_WEBHOOK_SECRET;

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

    // AppModule must be loaded AFTER the throwaway database env is applied: its
    // MikroORM options are computed at module evaluation time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('~/bootstrap/app.module') as typeof BootstrapAppModule;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(
        new LocalFileStorageService({
          driver: 'local',
          localRoot: storageRoot,
        }),
      )
      .overrideProvider(JobDispatcher)
      .useValue({ dispatch: jest.fn().mockResolvedValue(undefined) })
      .overrideProvider(CarrierParcelGateway)
      .useValue(carrierParcelGateway)
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

    fulfillmentService = app.get(FulfillmentService);
    financeMoneyEventProcessor = app.get(FinanceMoneyEventProcessorService);
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

  async function createSeller(prefix: string): Promise<TestSeller> {
    const agent = request.agent(app.getHttpServer());
    const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.com`;

    const registerResponse = await agent
      .post(`${API_PREFIX}/auth/register`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', randomForwardedIp())
      .send({ email, password: VALID_TEST_PASSWORD, displayName: 'Seller' })
      .expect(201);

    // Registration assigns the customer role (shops.create); grant the seller
    // role so shop management endpoints pass the permissions guard.
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
        shop_name: `shop${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`,
        currency: 'USD',
      })
      .expect(201);

    return {
      agent, email, shopId: shopResponse.body.id as string, shopPublicId: shopResponse.body.id as string, 
    };
  }

  async function createBuyer(): Promise<TestBuyer> {
    const agent = request.agent(app.getHttpServer());
    const email = `buyer-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.com`;

    const registerResponse = await agent
      .post(`${API_PREFIX}/auth/register`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', randomForwardedIp())
      .send({ email, password: VALID_TEST_PASSWORD, displayName: 'Buyer' })
      .expect(201);

    const addressResponse = await agent
      .post(`${API_PREFIX}/me/addresses`)
      .send({
        full_name: 'Buyer One',
        address_1: '1 Test Street',
        city: 'Portland',
        state: 'OR',
        zip: '97201',
        country: 'US',
        phone: '+14155552671',
      })
      .expect(201);

    return {
      agent,
      email,
      userId: registerResponse.body.user.id as string,
      addressId: addressResponse.body.address.id as string,
    };
  }

  async function createProduct(input: {
    seller: TestSeller;
    title: string;
    sku: string;
    priceMinor: number;
    stock: number;
  }) {
    const productResponse = await input.seller.agent
      .post(`${API_PREFIX}/shops/${input.seller.shopPublicId}/products`)
      .set('Idempotency-Key', randomUUID())
      .send({
        category_id: await seedCategory(input.seller.agent),
        title: input.title,
        description: 'Fulfillment test product',
        who_made: ProductWhoMade.I_DID,
      })
      .expect(201);
    const productId = productResponse.body.id as string;
    const productPublicId = productResponse.body.id as string;

    const draftResponse = await input.seller.agent
      .get(`${API_PREFIX}/shops/${input.seller.shopPublicId}/products/${productPublicId}`)
      .expect(200);
    const variantId = draftResponse.body.variants[0].id as string;

    // Inventory, pricing and shipping configuration are seeded directly: the
    // product images, shipping and variant-configuration write endpoints
    // currently fail for unrelated reasons in this working tree.
    const existingInventory = await sql.query(
      'select "id" from "product_inventory" where "product_variant_id" = $1',
      [variantId],
    );
    const inventoryId = (existingInventory.rows[0]?.id as string | undefined) ?? randomUUID();
    const internalShopId = await resolveShopId(sql, input.seller.shopId);
    const internalProductId = await resolveProductId(sql, productId);

    if (existingInventory.rows.length === 0) {
      await sql.query(
        `insert into "product_inventory"
           ("id", "created_at", "updated_at", "shop_id", "product_id", "product_variant_id", "sku", "stock", "on_hand_quantity", "reserved_quantity", "on_hand_version", "lifecycle_state")
         values ($1, now(), now(), $2, $3, $4, $5, $6, $6, 0, 1, 'active')`,
        [inventoryId, internalShopId, internalProductId, variantId, input.sku, input.stock],
      );
    }
    else {
      await sql.query(
        `update "product_inventory"
         set "sku" = $2, "stock" = $3, "on_hand_quantity" = $3, "reserved_quantity" = 0, "on_hand_version" = 1, "lifecycle_state" = 'active', "removed_at" = null, "updated_at" = now()
         where "id" = $1`,
        [inventoryId, input.sku, input.stock],
      );
    }

    const existingPool = await sql.query<{ id: string }>(
      'select "id" from "product_stock_pool" where "inventory_id" = $1 and "is_default" = true',
      [inventoryId],
    );
    if (existingPool.rows.length === 0) {
      await sql.query(
        `insert into "product_stock_pool"
           ("id", "created_at", "updated_at", "inventory_id", "shop_id", "name", "custody", "is_default", "lifecycle_state", "on_hand_quantity", "reserved_quantity", "on_hand_version", "stock")
         values ($1, now(), now(), $2, $3, 'Default seller pool', 'seller', true, 'active', $4, 0, 1, $4)`,
        [randomUUID(), inventoryId, internalShopId, input.stock],
      );
    }
    else {
      await sql.query(
        `update "product_stock_pool"
         set "on_hand_quantity" = $2, "reserved_quantity" = 0, "on_hand_version" = 1, "stock" = $2, "updated_at" = now()
         where "id" = $1`,
        [existingPool.rows[0].id, input.stock],
      );
    }
    await sql.query('delete from "variant_prices" where "product_inventory_id" = $1', [inventoryId]);
    await sql.query(
      `insert into "variant_prices"
         ("id", "product_inventory_id", "price_type", "market_code", "currency", "amount_minor", "active_from", "created_at", "updated_at")
       values ($1, $2, 'base', null, 'USD', $3, now(), now(), now())`,
      [randomUUID(), inventoryId, input.priceMinor],
    );


    const profileId = await seedShopShippingProfile(sql, {
      shopId: input.seller.shopId,
      name: `Fulfillment shipping ${productId.slice(0, 8)}`,
      rates: [
        {
          destinationScope: 'country',
          destinationCountry: 'US',
          oneItemFeeMinor: 599,
          additionalItemFeeMinor: 199,
        },
      ],
    });
    await assignProductShippingProfile(sql, productId, profileId);

    await sql.query(
      'update "products" set "state" = \'active\', "updated_at" = now() where "public_id" = $1',
      [productId],
    );

    return { productId, inventoryId };
  }
  async function checkoutBuyerOrder(input: {
    buyer: TestBuyer;
    inventoryId: string;
    quantity: number;
  }): Promise<SeededOrder> {
    const forwardedIp = randomForwardedIp();
    const cartResponse = await input.buyer.agent
      .post(`${API_PREFIX}/cart/items`)
      .set('X-Forwarded-For', forwardedIp)
      .send({
        inventory_id: input.inventoryId,
        quantity: input.quantity,
        is_temp: true,
      })
      .expect(201);
    const quoteResponse = await input.buyer.agent
      .post(`${API_PREFIX}/me/checkout/buy-now/quote`)
      .set('X-Forwarded-For', forwardedIp)
      .send({
        cart_id: cartResponse.body.cart.id,
        user_address_id: input.buyer.addressId,
        presentment_currency: 'USD',
      })
      .expect(201);
    const orderResponse = await input.buyer.agent
      .put(`${API_PREFIX}/me/checkout/buy-now`)
      .set('X-Forwarded-For', forwardedIp)
      .send({
        payment_type: 'cash',
        quote_id: quoteResponse.body.quote_id,
      })
      .expect(200);
    const orderShop = orderResponse.body.order_shops[0] as { id: string };
    const orderRow = await sql.query<{ id: string }>(
      'select "id" from "orders" where "public_id" = $1',
      [orderShop.id],
    );
    const orderItem = await sql.query<{ id: string }>(
      'select "id" from "order_items" where "order_id" = $1',
      [orderRow.rows[0].id],
    );

    return {
      orderId: orderRow.rows[0].id,
      orderPublicId: orderShop.id,
      orderItemId: orderItem.rows[0].id,
      quantity: input.quantity,
    };
  }

  let categoryId: string | undefined;

  async function seedCategory(agent: Agent): Promise<string> {
    if (categoryId) {
      return categoryId;
    }

    const response = await agent
      .post(`${API_PREFIX}/categories`)
      .set('Idempotency-Key', randomUUID())
      .send({ name: 'Fulfillment', rank: 1 })
      .expect(201);

    categoryId = response.body.id as string;

    return categoryId;
  }

  async function seedOrder(input: {
    seller: TestSeller;
    buyer: TestBuyer;
    productId: string;
    inventoryId: string;
    quantity: number;
    status?: 'pending' | 'paid' | 'checkout_pending' | 'canceled';
    shippingStatus?: 'pre_transit' | 'in_transit' | 'shipped' | 'delivered';
    trackingNumber?: string;
    shippedAt?: boolean;
    deliveredAt?: boolean;
  }): Promise<SeededOrder> {
    const orderId = randomUUID();
    const orderItemId = randomUUID();
    const orderPublicId = `ord_${orderId.replace(/-/g, '').slice(0, 12)}`;
    const totalMinor = 1999 * input.quantity;
    const internalShopId = await resolveShopId(sql, input.seller.shopId);
    const internalProductId = await resolveProductId(sql, input.productId);

    await sql.query(
      `insert into "orders" (
         "id", "created_at", "updated_at", "user_id", "customer_email", "shop_id",
         "payment_type", "status", "shipping_status", "currency",
         "subtotal", "total_shipping_fee", "total_discount", "total",
         "promo_codes", "shipping_address", "shipping_origin_countries",
         "shipping_to_country", "shipping_estimated_delivery",
         "subtotal_minor", "shipping_minor", "discount_minor", "total_minor",
         "order_number", "tracking_number", "shipped_at", "delivered_at", "fulfillment_status",
         "public_id"
       ) values (
         $1, now(), now(), $2, $3, $4,
         'cash', $5, $6, 'USD',
         19.99, 0, 0, 19.99,
         '{}', '{"full_name":"Buyer One","address1":"1 Test Street","city":"Portland","country":"US","state":"OR","zip":"97201"}', '{US}',
         'US', now() + interval '7 days',
         $7, 0, 0, $7,
         $8, $9, $10, $11, $12, $13
       )`,
      [
        orderId,
        input.buyer.userId,
        input.buyer.email,
        internalShopId,
        input.status ?? 'paid',
        input.shippingStatus ?? 'pre_transit',
        totalMinor,
        `ORD-${Date.now()}${Math.floor(Math.random() * 1000)}`,
        input.trackingNumber ?? null,
        input.shippedAt ? daysAgo(10) : null,
        input.deliveredAt ? daysAgo(3) : null,
        storedFulfillmentStatus(input.status ?? 'paid', input.shippingStatus ?? 'pre_transit'),
        orderPublicId,
      ],
    );

    await sql.query(
      `insert into "order_items" (
         "id", "created_at", "updated_at", "order_id", "product_id", "inventory_id",
         "title", "price", "quantity", "unit_price_minor", "line_total_minor", "currency", "sku"
       ) values ($1, now(), now(), $2, $3, $4, 'Fulfillment item', 19.99, $5, 1999, $6, 'USD', $7)`,
      [
        orderItemId,
        orderId,
        internalProductId,
        input.inventoryId,
        input.quantity,
        totalMinor,
        `SKU-${Date.now()}`,
      ],
    );

    return {
      orderId, orderPublicId, orderItemId, quantity: input.quantity, 
    };
  }

  async function assignGroup(input: {
    order: SeededOrder;
    shopId: string;
  }): Promise<void> {
    const entityManager = app.get(EntityManager).fork();
    const internalShopId = await resolveShopId(sql, input.shopId);

    await entityManager.transactional(async (transactionalEntityManager) => {
      await fulfillmentService.assignSellerGroupToOrder(transactionalEntityManager, {
        orderId: input.order.orderId,
        shopId: internalShopId,
        items: [
          { orderItemId: input.order.orderItemId, quantity: input.order.quantity },
        ],
        actor: {
          actorType: ShipmentUpdateActorType.SYSTEM,
          source: ShipmentUpdateSource.CHECKOUT,
        },
      });
    });
  }

  async function getShopOrder(
    agent: Agent,
    shopPublicId: string,
    orderPublicId: string,
  ): Promise<{ order: { status: string; fulfillment: Fulfillment } }> {
    const response = await agent
      .get(`${API_PREFIX}/shops/${shopPublicId}/orders/${orderPublicId}`)
      .expect(200);

    return response.body as { order: { status: string; fulfillment: Fulfillment } };
  }

  async function readInventoryStock(inventoryId: string): Promise<number> {
    const result = await sql.query(
      'select "stock" from "product_inventory" where "id" = $1',
      [inventoryId],
    );

    return Number(result.rows[0].stock);
  }

  async function seedMultiItemOrder(input: {
    seller: TestSeller;
    buyer: TestBuyer;
    items: Array<{ productId: string; inventoryId: string; quantity: number }>;
    status?: 'pending' | 'paid' | 'checkout_pending' | 'canceled';
  }): Promise<{ orderId: string; orderPublicId: string; items: Array<{ orderItemId: string; quantity: number }> }> {
    const orderId = randomUUID();
    const orderItemIds = input.items.map(() => randomUUID());
    const orderPublicId = `ord_${orderId.replace(/-/g, '').slice(0, 12)}`;
    const totalMinor = input.items.reduce(
      (total, item) => total + (1999 * item.quantity),
      0,
    );
    const internalShopId = await resolveShopId(sql, input.seller.shopId);

    await sql.query(
      `insert into "orders" (
         "id", "created_at", "updated_at", "user_id", "customer_email", "shop_id",
         "payment_type", "status", "shipping_status", "currency",
         "subtotal", "total_shipping_fee", "total_discount", "total",
         "promo_codes", "shipping_address", "shipping_origin_countries",
         "shipping_to_country", "shipping_estimated_delivery",
         "subtotal_minor", "shipping_minor", "discount_minor", "total_minor",
         "order_number", "fulfillment_status", "public_id"
       ) values (
         $1, now(), now(), $2, $3, $4,
         'cash', $5, 'pre_transit', 'USD',
         $6::numeric, 0, 0, $6::numeric,
         '{}', '{"full_name":"Buyer One","address1":"1 Test Street","city":"Portland","country":"US","state":"OR","zip":"97201"}', '{US}',
         'US', now() + interval '7 days',
         $6::int, 0, 0, $6::int,
         $7, $8, $9
       )`,
      [
        orderId,
        input.buyer.userId,
        input.buyer.email,
        internalShopId,
        input.status ?? 'paid',
        totalMinor,
        `ORD-${Date.now()}${Math.floor(Math.random() * 1000)}`,
        storedFulfillmentStatus(input.status ?? 'paid', 'pre_transit'),
        orderPublicId,
      ],
    );

    for (let index = 0; index < input.items.length; index += 1) {
      const item = input.items[index]!;
      const internalProductId = await resolveProductId(sql, item.productId);
      await sql.query(
        `insert into "order_items" (
           "id", "created_at", "updated_at", "order_id", "product_id", "inventory_id",
           "title", "price", "quantity", "unit_price_minor", "line_total_minor", "currency", "sku"
         ) values ($1, now(), now(), $2, $3, $4, 'Fulfillment item', 19.99, $5, 1999, $6, 'USD', $7)`,
        [
          orderItemIds[index],
          orderId,
          internalProductId,
          item.inventoryId,
          item.quantity,
          1999 * item.quantity,
          `SKU-${Date.now()}-${index}`,
        ],
      );
    }

    return {
      orderId,
      orderPublicId,
      items: input.items.map((item, index) => ({
        orderItemId: orderItemIds[index]!,
        quantity: item.quantity,
      })),
    };
  }

  async function assignGroupItems(input: {
    orderId: string;
    shopId: string;
    items: Array<{ orderItemId: string; quantity: number }>;
  }): Promise<void> {
    const entityManager = app.get(EntityManager).fork();
    const internalShopId = await resolveShopId(sql, input.shopId);

    await entityManager.transactional(async (transactionalEntityManager) => {
      await fulfillmentService.assignSellerGroupToOrder(transactionalEntityManager, {
        orderId: input.orderId,
        shopId: internalShopId,
        items: input.items,
        actor: {
          actorType: ShipmentUpdateActorType.SYSTEM,
          source: ShipmentUpdateSource.CHECKOUT,
        },
      });
    });
  }

  function prepareShipmentRequest(
    seller: TestSeller,
    orderPublicId: string,
    body: Record<string, unknown>,
  ) {
    return seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${orderPublicId}/fulfillment/shipments`)
      .set('Idempotency-Key', randomUUID())
      .send(body);
  }

  function purchaseLabelRequest(
    seller: TestSeller,
    orderPublicId: string,
    body: Record<string, unknown>,
    idempotencyKey = randomUUID(),
  ) {
    return seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${orderPublicId}/fulfillment/shipments/label`)
      .set('Idempotency-Key', idempotencyKey)
      .send(body);
  }

  async function buyLabel(
    seller: TestSeller,
    order: SeededOrder,
    quantity = 1,
  ): Promise<{ quoteId: string; label: ReturnType<typeof purchasedLabelFixture>; shipment: Shipment }> {
    const quoteId = `rq_${randomUUID()}`;
    const label = purchasedLabelFixture(quoteId);
    carrierParcelGateway.purchaseLabel.mockReset();
    carrierParcelGateway.purchaseLabel.mockResolvedValueOnce(label);

    const response = await purchaseLabelRequest(seller, order.orderPublicId, {
      quote_id: quoteId,
      items: [{ order_item_id: order.orderItemId, quantity }],
    }).expect(201);

    return {
      quoteId,
      label,
      shipment: (response.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!,
    };
  }

  function refundLabelRequest(
    seller: TestSeller,
    orderPublicId: string,
    shipmentId: string,
    idempotencyKey = randomUUID(),
  ) {
    return seller.agent
      .delete(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${orderPublicId}/fulfillment/shipments/${shipmentId}/label`)
      .set('Idempotency-Key', idempotencyKey)
      .send();
  }

  async function readSellerPayable(seller: TestSeller) {
    const response = await seller.agent
      .get(`${API_PREFIX}/shops/${seller.shopPublicId}/finance/payable`)
      .expect(200);

    return response.body as {
      currency: string;
      available_minor: number;
      not_yet_available_minor: number;
    };
  }

  async function listLabelChargeRows(seller: TestSeller) {
    const response = await seller.agent
      .get(`${API_PREFIX}/shops/${seller.shopPublicId}/finance/transactions`)
      .expect(200);

    return (response.body.transactions as Array<{
      date: string;
      reference: string;
      order_number: string | null;
      payout_number: string | null;
      type: string;
      status: string;
      order_amount_minor: number | null;
      fees_minor: number | null;
      net_amount_minor: number;
      currency: string;
      source: string | null;
    }>).filter(row => row.type === 'label_charge' || row.type === 'label_refund');
  }

  /**
   * The seller's only status authority: declaring that a prepared Shipment was
   * handed to its carrier. Every later status is carrier evidence.
   */
  function handoverRequest(
    seller: TestSeller,
    orderPublicId: string,
    shipmentId: string,
  ) {
    return seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${orderPublicId}/fulfillment/shipments/${shipmentId}/handover`)
      .set('Idempotency-Key', randomUUID())
      .send({});
  }

  async function readShipment(
    seller: TestSeller,
    orderPublicId: string,
    shipmentId: string,
  ): Promise<Shipment> {
    const detail = await getShopOrder(seller.agent, seller.shopPublicId, orderPublicId);
    const shipment = detail.order.fulfillment.groups
      .flatMap((group) => group.shipments)
      .find((candidate) => candidate.id === shipmentId);

    if (!shipment) {
      throw new Error(`Shipment ${shipmentId} not found on order ${orderPublicId}`);
    }

    return shipment;
  }

  /** Reports progress for a Shipment the way its carrier would. */
  async function reportCarrierEvent(
    seller: TestSeller,
    orderPublicId: string,
    shipmentId: string,
    eventCode: string,
  ): Promise<void> {
    const shipment = await readShipment(seller, orderPublicId, shipmentId);

    await carrierEventRequest(carrierEventBody({
      carrier: shipment.carrier,
      trackingNumber: shipment.tracking_number,
      eventCode,
    })).expect(200);
  }

  async function deliverByCarrier(
    seller: TestSeller,
    orderPublicId: string,
    shipmentId: string,
  ): Promise<void> {
    await reportCarrierEvent(seller, orderPublicId, shipmentId, 'DELIVERED');
  }

  function carrierSignature(body: unknown, secret = CARRIER_WEBHOOK_SECRET): string {
    return `sha256=${createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex')}`;
  }

  // Tracking numbers are unique per carrier among live Shipments, so each
  // scenario uses its own number instead of colliding with earlier scenarios.
  function uspsTrackingNumber(): string {
    return `94001118992231${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`;
  }

  function purchasedLabelFixture(quoteId: string, trackingNumber = uspsTrackingNumber()) {
    return {
      labelId: `lbl_${randomUUID()}`,
      quoteId,
      carrier: 'usps',
      service: 'standard',
      trackingNumber,
      priceMinor: 980,
      currency: 'USD',
      pdf: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n'),
    };
  }

  function carrierEventBody(input: {
    eventId?: string;
    carrier?: string;
    trackingNumber?: string;
    eventCode: string;
    location?: string;
    occurredAt?: string;
  }): Record<string, unknown> {
    return {
      event_id: input.eventId ?? randomUUID(),
      carrier: input.carrier ?? 'usps',
      tracking_number: input.trackingNumber ?? '9400111899223100001234',
      event_code: input.eventCode,
      ...(input.location === undefined ? {} : { location: input.location }),
      occurred_at: input.occurredAt ?? new Date().toISOString(),
    };
  }

  function carrierEventRequest(
    body: Record<string, unknown>,
    options: { signature?: string | null } = {},
  ) {
    const serverRequest = request(app.getHttpServer())
      .post(`${API_PREFIX}/webhooks/carrier`);
    const signature = options.signature === null
      ? undefined
      : options.signature ?? carrierSignature(body);

    if (signature) {
      serverRequest.set('x-carrier-signature', signature);
    }

    return serverRequest.send(body);
  }

  async function readShipmentUpdates(shipmentPublicId: string) {
    const result = await sql.query<{
      status: string;
      actor_type: string;
      actor_id: string | null;
      source: string;
      note: string | null;
      event_code: string | null;
      location: string | null;
      carrier_event_id: string | null;
      payload: Record<string, unknown> | null;
    }>(
      `select "status", "actor_type", "actor_id", "source", "note", "event_code", "location",
              "carrier_event_id", "payload"
         from "shipment_updates"
        where "shipment_id" = (select "id" from "shipments" where "public_id" = $1)
        order by "created_at", "id"`,
      [shipmentPublicId],
    );

    return result.rows;
  }

  async function waitForOrderStatus(orderId: string, expected: string): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const result = await sql.query<{ status: string }>(
        'select "status" from "orders" where "id" = $1',
        [orderId],
      );

      if (result.rows[0]?.status === expected) {
        return;
      }

      await delay(25);
    }

    const result = await sql.query<{ status: string }>(
      'select "status" from "orders" where "id" = $1',
      [orderId],
    );
    throw new Error(`Expected order ${orderId} status ${expected}, received ${result.rows[0]?.status}`);
  }

  function cancelOrderRequest(seller: TestSeller, orderPublicId: string, reason: string) {
    return seller.agent
      .patch(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${orderPublicId}/status`)
      .send({ status: 'canceled', cancel_reason: reason });
  }

  async function activePreparedQuantity(orderId: string): Promise<number> {
    const result = await sql.query(
      `select coalesce(sum("si"."quantity"), 0)::int as "quantity"
       from "shipment_items" as "si"
       join "shipments" as "s" on "s"."id" = "si"."shipment_id"
       where "s"."order_id" = $1 and "s"."status" <> 'voided'`,
      [orderId],
    );

    return Number(result.rows[0].quantity);
  }

  it('quotes and confirms a deliverable order without a standalone shop Shipping Origin', async () => {
    const seller = await createSeller('seller-no-origin');
    const buyer = await createBuyer();
    const { inventoryId } = await createProduct({
      seller,
      title: 'No Origin Mug',
      sku: `NOO-${Date.now()}`,
      priceMinor: 1499,
      stock: 5,
    });

    // The standalone shop Shipping Origin resource no longer exists.
    await seller.agent
      .get(`${API_PREFIX}/shops/${seller.shopPublicId}/shipping-origin`)
      .expect(404);
    await seller.agent
      .put(`${API_PREFIX}/shops/${seller.shopPublicId}/shipping-origin`)
      .set('Idempotency-Key', randomUUID())
      .send({
        phone: '+15035550111',
        address1: '10 Dispatch Road',
        city: 'Portland',
        state: 'OR',
        zip: '97205',
        country: 'US',
      })
      .expect(404);

    // A shop that never configured a shop-wide dispatch address still quotes
    // and accepts a deliverable order: inventory source selection is the one
    // default seller Stock Pool, not a shop-level origin.
    const order = await checkoutBuyerOrder({
      buyer,
      inventoryId,
      quantity: 2,
    });
    const detail = await getShopOrder(seller.agent, seller.shopPublicId, order.orderPublicId);

    expect(detail.order.fulfillment.groups).toHaveLength(1);
    expect(detail.order.fulfillment.groups[0].items).toEqual([
      { order_item_id: order.orderItemId, quantity: 2 },
    ]);
  });

  it('serializes concurrent seller-group assignment replays', async () => {
    const seller = await createSeller('seller-group-replay');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Replay-safe parcel',
      sku: `RPL-${Date.now()}`,
      priceMinor: 1499,
      stock: 5,
    });
    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 2,
    });
    const actor = {
      actorType: ShipmentUpdateActorType.SYSTEM,
      source: ShipmentUpdateSource.CHECKOUT,
    };
    const {
      promise: firstRelease,
      resolve: releaseFirst,
    } = createDeferredSignal();
    const {
      promise: firstReady,
      resolve: markFirstReady,
    } = createDeferredSignal();
    const {
      promise: secondStarted,
      resolve: markSecondStarted,
    } = createDeferredSignal();

    const internalShopId = await resolveShopId(sql, seller.shopId);
    const first = app.get(EntityManager).fork().transactional(async (entityManager) => {
      const group = await fulfillmentService.assignSellerGroupToOrder(entityManager, {
        orderId: order.orderId,
        shopId: internalShopId,
        items: [{ orderItemId: order.orderItemId, quantity: order.quantity }],
        actor,
      });
      markFirstReady();
      await firstRelease;
      return group.id;
    });
    await firstReady;

    const second = app.get(EntityManager).fork().transactional(async (entityManager) => {
      markSecondStarted();
      return fulfillmentService.assignSellerGroupToOrder(entityManager, {
        orderId: order.orderId,
        shopId: internalShopId,
        items: [{ orderItemId: order.orderItemId, quantity: order.quantity }],
        actor,
      });
    });
    await secondStarted;
    await new Promise((resolve) => setTimeout(resolve, 25));
    releaseFirst();

    const [firstGroupId, secondGroup] = await Promise.all([first, second]);
    expect(secondGroup.id).toBe(firstGroupId);
    const groupCount = await sql.query(
      'select count(*)::int as count from "fulfillment_groups" where "order_id" = $1',
      [order.orderId],
    );
    expect(groupCount.rows[0].count).toBe(1);
  });

  it('prepares, hands over, transits and delivers a confirmed order through public APIs', async () => {
    const seller = await createSeller('seller-fulfillment');
    const buyer = await createBuyer();
    const { inventoryId } = await createProduct({
      seller,
      title: 'Fulfillment Mug',
      sku: `FUL-${Date.now()}`,
      priceMinor: 1999,
      stock: 10,
    });

    const order = await checkoutBuyerOrder({
      buyer,
      inventoryId,
      quantity: 2,
    });
    const stockAfterCheckout = await readInventoryStock(inventoryId);

    const before = await getShopOrder(seller.agent, seller.shopPublicId, order.orderPublicId);
    const group = before.order.fulfillment.groups[0]!;
    expect(before.order.fulfillment.groups).toHaveLength(1);
    expect(group.method).toBe('seller');
    expect(group.operator).toBe('seller');
    expect(group.items).toEqual([{ order_item_id: order.orderItemId, quantity: 2 }]);
    expect(group.shipments).toEqual([]);
    expect(before.order.fulfillment.status).toBe('unfulfilled');
    expect(before.order.fulfillment.progress).toMatchObject({
      ordered: 2,
      prepared: 0,
      dispatched: 0,
      delivered: 0,
      outstanding: 2,
    });

    const trackingNumber = uspsTrackingNumber();
    const prepareResponse = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments`)
      .set('Idempotency-Key', randomUUID())
      .send({ carrier: 'usps', tracking_number: trackingNumber, shipment_note: 'Front desk' })
      .expect(201);

    const preparedShipment = (prepareResponse.body.fulfillment as Fulfillment)
      .groups[0]!.shipments[0]!;
    expect(preparedShipment.status).toBe('prepared');
    expect(preparedShipment.carrier).toBe('usps');
    expect(preparedShipment.tracking_number).toBe(trackingNumber);
    expect(preparedShipment.carrier_name).toBe('USPS');
    expect(preparedShipment.carrier_observable).toBe(true);
    expect(preparedShipment.dispatched_at ?? null).toBeNull();
    expect(preparedShipment.items).toEqual([
      { order_item_id: order.orderItemId, quantity: 2 },
    ]);
    expect(prepareResponse.body.fulfillment.status).toBe('prepared');
    // Preparation does not alter the cash Order's commercial payment state.
    expect((await getShopOrder(seller.agent, seller.shopPublicId, order.orderPublicId)).order.status)
      .toBe('pending');

    const dispatchResponse = await handoverRequest(
      seller,
      order.orderPublicId,
      preparedShipment.id,
    ).expect(201);
    expect(dispatchResponse.body.fulfillment.status).toBe('shipped');

    const dispatchedShipment = dispatchResponse.body.fulfillment.groups[0].shipments[0];
    expect(dispatchedShipment.status).toBe('dispatched');
    expect(dispatchedShipment.dispatched_at).toEqual(expect.any(String));

    // The declaration is recorded as exactly one seller-sourced dispatch update.
    const sellerUpdates = (dispatchedShipment.updates as Shipment['updates'])
      .filter((update) => update.status === 'dispatched');
    expect(sellerUpdates).toHaveLength(1);
    expect(sellerUpdates[0]).toMatchObject({
      actor_type: 'seller',
      actor_id: expect.any(String),
      source: 'seller',
    });

    // Repeating the declaration does not duplicate updates or reset timestamps.
    const replayResponse = await handoverRequest(
      seller,
      order.orderPublicId,
      preparedShipment.id,
    ).expect(201);
    expect(replayResponse.body.fulfillment.groups[0].shipments[0].updates).toHaveLength(
      Number(dispatchedShipment.updates.length),
    );
    expect(replayResponse.body.fulfillment.groups[0].shipments[0].dispatched_at)
      .toBe(dispatchedShipment.dispatched_at);

    // Transit and delivery are the carrier's to report, not the seller's.
    await reportCarrierEvent(
      seller,
      order.orderPublicId,
      preparedShipment.id,
      'IN_TRANSIT',
    );

    await deliverByCarrier(seller, order.orderPublicId, preparedShipment.id);

    const deliveredResponse = await getShopOrder(
      seller.agent,
      seller.shopPublicId,
      order.orderPublicId,
    );
    expect(deliveredResponse.order.fulfillment.status).toBe('delivered');
    expect(deliveredResponse.order.fulfillment.progress).toMatchObject({
      ordered: 2,
      dispatched: 2,
      delivered: 2,
      outstanding: 0,
    });

    const deliveredUpdates = deliveredResponse.order.fulfillment
      .groups[0]!.shipments[0]!.updates;
    expect(deliveredUpdates.map((update) => update.status)).toEqual([
      'prepared',
      'dispatched',
      'in_transit',
      'delivered',
    ]);
    expect(deliveredUpdates.slice(1).map((update) => update.source)).toEqual([
      'seller',
      'carrier',
      'carrier',
    ]);

    // Delivery does not mark a cash Order paid or commercially complete.
    const deliveredOrder = await getShopOrder(seller.agent, seller.shopPublicId, order.orderPublicId);
    expect(deliveredOrder.order.status).toBe('pending');

    // Buyer observes the same Shipment identity and quantities.
    const buyerDetail = await buyer.agent
      .get(`${API_PREFIX}/me/orders/${order.orderPublicId}`)
      .expect(200);
    const buyerFulfillment = buyerDetail.body.order_shop.fulfillment as Fulfillment;
    expect(buyerFulfillment.status).toBe('delivered');
    expect(buyerFulfillment.groups[0]!.shipments[0]).toMatchObject({
      id: preparedShipment.id,
      status: 'delivered',
      tracking_number: trackingNumber,
    });

    // Authorized guest tracking sees the same collection.
    const guestLookup = await request(app.getHttpServer())
      .get(`${API_PREFIX}/checkout/guest-orders`)
      .query({ email: buyer.email, order_id: order.orderPublicId, zip: '97201' })
      .expect(200);
    const guestOrder = guestLookup.body.order_shops[0];
    expect(guestOrder.fulfillment.status).toBe('delivered');
    expect(guestOrder.fulfillment.groups[0].shipments[0].tracking_number).toBe(trackingNumber);

    // A non-matching zip leaks nothing.
    const wrongZip = await request(app.getHttpServer())
      .get(`${API_PREFIX}/checkout/guest-orders`)
      .query({ email: buyer.email, order_id: order.orderPublicId, zip: '00000' })
      .expect(200);
    expect(wrongZip.body.order_shops).toEqual([]);

    // Dispatching never decrements stock already consumed at purchase.
    expect(stockAfterCheckout).toBe(8);
    expect(await readInventoryStock(inventoryId)).toBe(stockAfterCheckout);

    // Cross-shop mutation is rejected without side effects.
    const otherSeller = await createSeller('other-seller');
    await otherSeller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments`)
      .set('Idempotency-Key', randomUUID())
      .send({ carrier: 'dhl' })
      .expect(403);

    const shipmentsAfterCrossShop = await sql.query(
      'select count(*)::int as count from "shipments" where "order_id" = $1',
      [order.orderId],
    );
    expect(shipmentsAfterCrossShop.rows[0].count).toBe(1);
  });

  it('hands over an unverified carrier shipment without fabricating progress', async () => {
    const seller = await createSeller('seller-handover-other');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Local Courier Crate',
      sku: `LCL-${Date.now()}`,
      priceMinor: 1499,
      stock: 4,
    });

    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'paid',
    });
    await assignGroup({ order, shopId: seller.shopId });

    const prepared = await prepareShipmentRequest(seller, order.orderPublicId, {
      carrier: 'other',
      tracking_number: 'LOCAL-COURIER-1',
    }).expect(201);
    const shipment = (prepared.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!;
    expect(shipment.carrier_observable).toBe(false);

    const handedOver = await handoverRequest(seller, order.orderPublicId, shipment.id)
      .expect(201);
    const declared = (handedOver.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!;
    expect(declared.status).toBe('dispatched');
    expect(declared.carrier_observable).toBe(false);
    expect(declared.dispatched_at).toEqual(expect.any(String));
    expect((handedOver.body.fulfillment as Fulfillment).progress).toMatchObject({
      ordered: 1,
      dispatched: 1,
      delivered: 0,
      outstanding: 0,
    });

    // The declaration is the only evidence: nothing claims transit or delivery.
    const updates = await readShipmentUpdates(shipment.id);
    expect(updates.map(update => update.status)).toEqual(['prepared', 'dispatched']);
    expect(updates[1]).toMatchObject({ actor_type: 'seller', source: 'seller' });
    expect(updates.every(update => update.carrier_event_id === null)).toBe(true);
  });

  it('amends carrier and tracking for three days after handover until the carrier scans', async () => {
    const seller = await createSeller('seller-handover-edit');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Editable Parcel',
      sku: `EDT-${Date.now()}`,
      priceMinor: 1999,
      stock: 5,
    });

    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'paid',
    });
    await assignGroup({ order, shopId: seller.shopId });

    const originalTrackingNumber = uspsTrackingNumber();
    const prepared = await prepareShipmentRequest(seller, order.orderPublicId, {
      carrier: 'usps',
      tracking_number: originalTrackingNumber,
    }).expect(201);
    const shipmentId = (prepared.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!.id;

    const handedOver = await handoverRequest(seller, order.orderPublicId, shipmentId)
      .expect(201);
    const dispatchedAt = (handedOver.body.fulfillment as Fulfillment)
      .groups[0]!.shipments[0]!.dispatched_at;
    expect(dispatchedAt).toEqual(expect.any(String));

    // Inside the window a mistyped number is recoverable without losing dispatch.
    const correctedTrackingNumber = uspsTrackingNumber();
    const corrected = await seller.agent
      .patch(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments/${shipmentId}`)
      .set('Idempotency-Key', randomUUID())
      .send({ tracking_number: correctedTrackingNumber })
      .expect(200);
    expect(corrected.body.fulfillment.groups[0].shipments[0]).toMatchObject({
      status: 'dispatched',
      tracking_number: correctedTrackingNumber,
      dispatched_at: dispatchedAt,
    });

    // Quantities are locked after handover: only carrier and tracking may change.
    const orderItemId = (prepared.body.fulfillment as Fulfillment)
      .groups[0]!.items[0]!.order_item_id;
    const itemsAfterHandover = await seller.agent
      .patch(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments/${shipmentId}`)
      .set('Idempotency-Key', randomUUID())
      .send({ items: [{ order_item_id: orderItemId, quantity: 1 }] });
    expect(itemsAfterHandover.status).toBe(409);
    expect(itemsAfterHandover.body.code).toBe('SHIPMENT_NOT_PREPARED');
    expect((await readShipment(seller, order.orderPublicId, shipmentId)).items)
      .toEqual([{ order_item_id: orderItemId, quantity: 1 }]);

    // The carrier scan closes the window early: the label is now in the world.
    await carrierEventRequest(carrierEventBody({
      trackingNumber: correctedTrackingNumber,
      eventCode: 'IN_TRANSIT',
    })).expect(200);

    const afterScan = await seller.agent
      .patch(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments/${shipmentId}`)
      .set('Idempotency-Key', randomUUID())
      .send({ tracking_number: uspsTrackingNumber() });
    expect(afterScan.status).toBe(409);
    expect(afterScan.body.code).toBe('SHIPMENT_NOT_PREPARED');
    expect((await readShipment(seller, order.orderPublicId, shipmentId)).tracking_number)
      .toBe(correctedTrackingNumber);

    // The window also expires on its own, three days after the declaration.
    const otherOrder = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'paid',
    });
    await assignGroup({ order: otherOrder, shopId: seller.shopId });
    const stale = await prepareShipmentRequest(seller, otherOrder.orderPublicId, {
      carrier: 'dhl',
      tracking_number: String(Math.floor(Math.random() * 10_000_000_000)).padStart(10, '0'),
    }).expect(201);
    const staleShipmentId = (stale.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!.id;
    await handoverRequest(seller, otherOrder.orderPublicId, staleShipmentId).expect(201);
    await sql.query(
      'update "shipments" set "dispatched_at" = now() - interval \'4 days\' where "public_id" = $1',
      [staleShipmentId],
    );

    const expired = await seller.agent
      .patch(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${otherOrder.orderPublicId}/fulfillment/shipments/${staleShipmentId}`)
      .set('Idempotency-Key', randomUUID())
      .send({ carrier: 'usps', tracking_number: uspsTrackingNumber() });
    expect(expired.status).toBe(409);
    expect(expired.body.code).toBe('SHIPMENT_NOT_PREPARED');
  });

  it('rejects shipment commands for unconfirmed payment states and cross-order items', async () => {
    const seller = await createSeller('seller-pending');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Pending Plate',
      sku: `PEND-${Date.now()}`,
      priceMinor: 1299,
      stock: 5,
    });

    const pendingOrder = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'checkout_pending',
    });

    const pendingResponse = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${pendingOrder.orderPublicId}/fulfillment/shipments`)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(400);
    expect(pendingResponse.body.code).toBe('ORDER_NOT_ELIGIBLE_FOR_FULFILLMENT');

    const shipmentCount = await sql.query(
      'select count(*)::int as count from "shipments" where "order_id" = $1',
      [pendingOrder.orderId],
    );
    expect(shipmentCount.rows[0].count).toBe(0);

    // Reconciliation is not allowed for a non-actionable order either.
    await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${pendingOrder.orderPublicId}/fulfillment/reconciliation`)
      .set('Idempotency-Key', randomUUID())
      .send({ items: [{ order_item_id: pendingOrder.orderItemId, quantity: 1 }] })
      .expect(400);

    const confirmedOrder = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'paid',
    });
    await assignGroup({ order: confirmedOrder, shopId: seller.shopId });

    const crossOrderResponse = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${confirmedOrder.orderPublicId}/fulfillment/shipments`)
      .set('Idempotency-Key', randomUUID())
      .send({ items: [{ order_item_id: pendingOrder.orderItemId, quantity: 1 }] })
      .expect(400);
    expect(crossOrderResponse.body.code).toBe('SHIPMENT_ITEM_NOT_IN_GROUP');

    const quantityExceeded = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${confirmedOrder.orderPublicId}/fulfillment/shipments`)
      .set('Idempotency-Key', randomUUID())
      .send({ items: [{ order_item_id: confirmedOrder.orderItemId, quantity: 5 }] })
      .expect(409);
    expect(quantityExceeded.body.code).toBe('SHIPMENT_QUANTITY_EXCEEDED');
  });

  it('preserves legacy shipping evidence and requires reconciliation before quantity-sensitive shipping', async () => {
    const seller = await createSeller('seller-legacy');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Legacy Lamp',
      sku: `LEG-${Date.now()}`,
      priceMinor: 4599,
      stock: 4,
    });

    const legacyOrder = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 3,
      status: 'paid',
      shippingStatus: 'delivered',
      trackingNumber: 'LEGACY-TRACK',
      shippedAt: true,
      deliveredAt: true,
    });

    const legacyDetail = await getShopOrder(seller.agent, seller.shopPublicId, legacyOrder.orderPublicId);
    expect(legacyDetail.order.fulfillment.groups).toEqual([]);
    // The aggregate matches what the list/filter reads; the uncertainty is carried
    // by requires_reconciliation plus the preserved legacy evidence.
    expect(legacyDetail.order.fulfillment.status).toBe('delivered');
    expect(legacyDetail.order.fulfillment.requires_reconciliation).toBe(true);
    expect(legacyDetail.order.fulfillment.legacy_shipping).toMatchObject({
      status: 'delivered',
      tracking_number: 'LEGACY-TRACK',
    });
    expect(legacyDetail.order.fulfillment.legacy_shipping.shipped_at)
      .toEqual(expect.any(String));
    expect(legacyDetail.order.fulfillment.legacy_shipping.delivered_at)
      .toEqual(expect.any(String));

    // New quantity-sensitive mutation requires reconciliation.
    const blocked = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${legacyOrder.orderPublicId}/fulfillment/shipments`)
      .set('Idempotency-Key', randomUUID())
      .send({ carrier: 'usps' })
      .expect(409);
    expect(blocked.body.code).toBe('FULFILLMENT_RECONCILIATION_REQUIRED');

    // Reconciliation cannot exceed the remaining obligation.
    const excessive = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${legacyOrder.orderPublicId}/fulfillment/reconciliation`)
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ order_item_id: legacyOrder.orderItemId, quantity: Number(legacyOrder.quantity) + 1 }],
      })
      .expect(400);
    expect(excessive.body.code).toBe('FULFILLMENT_RECONCILIATION_INCOMPLETE');

    // Partial attestation would understate the order's obligation, so it is rejected.
    const partial = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${legacyOrder.orderPublicId}/fulfillment/reconciliation`)
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ order_item_id: legacyOrder.orderItemId, quantity: legacyOrder.quantity - 1 }],
      })
      .expect(400);
    expect(partial.body.code).toBe('FULFILLMENT_RECONCILIATION_INCOMPLETE');

    const reconcileResponse = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${legacyOrder.orderPublicId}/fulfillment/reconciliation`)
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ order_item_id: legacyOrder.orderItemId, quantity: legacyOrder.quantity }],
      })
      .expect(201);
    expect(reconcileResponse.body.fulfillment.groups[0].provenance)
      .toBe('legacy_reconciliation');
    // Legacy evidence stays readable after reconciliation.
    expect(reconcileResponse.body.fulfillment.legacy_shipping.tracking_number)
      .toBe('LEGACY-TRACK');

    // Re-attesting an already-reconciled order is rejected outright.
    const reReconcile = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${legacyOrder.orderPublicId}/fulfillment/reconciliation`)
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ order_item_id: legacyOrder.orderItemId, quantity: legacyOrder.quantity }],
      })
      .expect(409);
    expect(reReconcile.body.code).toBe('FULFILLMENT_GROUP_ALREADY_ASSIGNED');

    const afterReconcile = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${legacyOrder.orderPublicId}/fulfillment/shipments`)
      .set('Idempotency-Key', randomUUID())
      .send({ carrier: 'usps' })
      .expect(201);
    expect(afterReconcile.body.fulfillment.groups[0].shipments[0].items).toHaveLength(1);
    expect(afterReconcile.body.fulfillment.groups[0].shipments[0].items[0].quantity).toBe(3);

    // Reconciliation did not consume stock again.
    expect(await readInventoryStock(inventoryId)).toBe(4);
  });

  it('refuses handover without a carrier and releases voided preparation', async () => {
    const seller = await createSeller('seller-journey');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Journey Tray',
      sku: `JRN-${Date.now()}`,
      priceMinor: 899,
      stock: 3,
    });

    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'paid',
    });
    await assignGroup({ order, shopId: seller.shopId });

    const prepareResponse = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments`)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    const shipmentId = prepareResponse.body.fulfillment.groups[0].shipments[0].id as string;

    // A declaration needs something to declare: carrier and tracking first.
    const missingCarrier = await handoverRequest(seller, order.orderPublicId, shipmentId)
      .expect(409);
    expect(missingCarrier.body.code).toBe('SHIPMENT_HANDOVER_REQUIREMENTS');
    expect((await readShipment(seller, order.orderPublicId, shipmentId)).status)
      .toBe('prepared');

    const amended = await seller.agent
      .patch(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments/${shipmentId}`)
      .set('Idempotency-Key', randomUUID())
      .send({ carrier: 'other', tracking_number: 'TRACK-EDIT' })
      .expect(200);
    expect(amended.body.fulfillment.groups[0].shipments[0].tracking_number).toBe('TRACK-EDIT');

    const voided = await seller.agent
      .delete(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments/${shipmentId}`)
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    expect(voided.body.fulfillment.groups[0].shipments[0].status).toBe('voided');
    expect(voided.body.fulfillment.progress.prepared).toBe(0);

    // A voided preparation cannot be handed over either.
    const voidedHandover = await handoverRequest(seller, order.orderPublicId, shipmentId)
      .expect(409);
    expect(voidedHandover.body.code).toBe('SHIPMENT_ALREADY_VOIDED');

    const reprepared = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments`)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    expect(reprepared.body.fulfillment.progress.prepared).toBe(1);
  });

  it('keeps the order open until every parcel of a split Order Item is delivered', async () => {
    const seller = await createSeller('seller-partial');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Partial Mug',
      sku: `PART-${Date.now()}`,
      priceMinor: 1999,
      stock: 10,
    });

    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 3,
      status: 'paid',
    });
    await assignGroup({ order, shopId: seller.shopId });

    const firstTrackingNumber = uspsTrackingNumber();
    const first = await prepareShipmentRequest(seller, order.orderPublicId, {
      items: [{ order_item_id: order.orderItemId, quantity: 1 }],
      carrier: 'usps',
      tracking_number: firstTrackingNumber,
    }).expect(201);
    const firstShipment = (first.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!;
    expect(firstShipment.items).toEqual([
      { order_item_id: order.orderItemId, quantity: 1 },
    ]);
    expect((first.body.fulfillment as Fulfillment).progress).toMatchObject({
      ordered: 3,
      prepared: 1,
      dispatched: 0,
      delivered: 0,
      outstanding: 3,
    });

    const second = await prepareShipmentRequest(seller, order.orderPublicId, {
      items: [{ order_item_id: order.orderItemId, quantity: 2 }],
      carrier: 'dhl',
      tracking_number: String(Math.floor(Math.random() * 10_000_000_000)).padStart(10, '0'),
    }).expect(201);
    const secondShipment = (second.body.fulfillment as Fulfillment).groups[0]!.shipments[1]!;
    expect((second.body.fulfillment as Fulfillment).groups[0]!.shipments).toHaveLength(2);
    expect((second.body.fulfillment as Fulfillment).progress).toMatchObject({
      ordered: 3,
      prepared: 3,
      outstanding: 3,
    });

    await handoverRequest(seller, order.orderPublicId, firstShipment.id).expect(201);
    await deliverByCarrier(seller, order.orderPublicId, firstShipment.id);

    const afterFirstParcel = await getShopOrder(seller.agent, seller.shopPublicId, order.orderPublicId);
    expect(afterFirstParcel.order.status).toBe('paid');
    expect(afterFirstParcel.order.fulfillment.status).toBe('partially_delivered');
    expect(afterFirstParcel.order.fulfillment.progress).toMatchObject({
      ordered: 3,
      dispatched: 1,
      delivered: 1,
      outstanding: 2,
    });

    // The buyer sees the outstanding consignment rather than an implied full delivery.
    const buyerAfterFirst = await buyer.agent
      .get(`${API_PREFIX}/me/orders/${order.orderPublicId}`)
      .expect(200);
    expect(buyerAfterFirst.body.order_shop.fulfillment.status).toBe('partially_delivered');
    expect(buyerAfterFirst.body.order_shop.fulfillment.groups[0].shipments).toHaveLength(2);

    await handoverRequest(seller, order.orderPublicId, secondShipment.id).expect(201);
    await deliverByCarrier(seller, order.orderPublicId, secondShipment.id);

    await waitForOrderStatus(order.orderId, 'completed');
    const afterSecondParcel = await getShopOrder(seller.agent, seller.shopPublicId, order.orderPublicId);
    expect(afterSecondParcel.order.status).toBe('completed');
    expect(afterSecondParcel.order.fulfillment.status).toBe('delivered');
    expect(afterSecondParcel.order.fulfillment.progress).toMatchObject({
      ordered: 3,
      dispatched: 3,
      delivered: 3,
      outstanding: 0,
    });

    // One Order Item was split without duplicating the obligation.
    const orderItemCount = await sql.query(
      'select count(*)::int as count from "order_items" where "order_id" = $1',
      [order.orderId],
    );
    expect(orderItemCount.rows[0].count).toBe(1);
    const groupCount = await sql.query(
      'select count(*)::int as count from "fulfillment_groups" where "order_id" = $1',
      [order.orderId],
    );
    expect(groupCount.rows[0].count).toBe(1);
    expect(await readInventoryStock(inventoryId)).toBe(10);
  });

  it('splits mixed Order Item quantities across consignments', async () => {
    const seller = await createSeller('seller-mixed');
    const buyer = await createBuyer();
    const firstProduct = await createProduct({
      seller,
      title: 'Mixed Cup',
      sku: `MIX-A-${Date.now()}`,
      priceMinor: 1999,
      stock: 5,
    });
    const secondProduct = await createProduct({
      seller,
      title: 'Mixed Plate',
      sku: `MIX-B-${Date.now()}`,
      priceMinor: 1999,
      stock: 5,
    });

    const order = await seedMultiItemOrder({
      seller,
      buyer,
      items: [
        { productId: firstProduct.productId, inventoryId: firstProduct.inventoryId, quantity: 2 },
        { productId: secondProduct.productId, inventoryId: secondProduct.inventoryId, quantity: 1 },
      ],
    });
    await assignGroupItems({ orderId: order.orderId, shopId: seller.shopId, items: order.items });

    const prepared = await prepareShipmentRequest(seller, order.orderPublicId, {
      items: [
        { order_item_id: order.items[0]!.orderItemId, quantity: 1 },
        { order_item_id: order.items[1]!.orderItemId, quantity: 1 },
      ],
      carrier: 'usps',
      tracking_number: uspsTrackingNumber(),
    }).expect(201);
    const shipmentId = (prepared.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!.id;
    expect((prepared.body.fulfillment as Fulfillment).progress).toMatchObject({
      ordered: 3,
      prepared: 2,
    });

    await handoverRequest(seller, order.orderPublicId, shipmentId).expect(201);
    await deliverByCarrier(seller, order.orderPublicId, shipmentId);

    const partial = await getShopOrder(seller.agent, seller.shopPublicId, order.orderPublicId);
    expect(partial.order.status).toBe('paid');
    expect(partial.order.fulfillment.progress).toMatchObject({
      ordered: 3,
      delivered: 2,
      outstanding: 1,
    });

    const remainder = await prepareShipmentRequest(seller, order.orderPublicId, {
      items: [{ order_item_id: order.items[0]!.orderItemId, quantity: 1 }],
      carrier: 'dhl',
      tracking_number: String(Math.floor(Math.random() * 10_000_000_000)).padStart(10, '0'),
    }).expect(201);
    expect((remainder.body.fulfillment as Fulfillment).groups[0]!.items).toEqual([
      { order_item_id: order.items[0]!.orderItemId, quantity: 2 },
      { order_item_id: order.items[1]!.orderItemId, quantity: 1 },
    ]);

    const remainderShipmentId = (remainder.body.fulfillment as Fulfillment)
      .groups[0]!.shipments[1]!.id;
    await handoverRequest(seller, order.orderPublicId, remainderShipmentId).expect(201);
    await deliverByCarrier(seller, order.orderPublicId, remainderShipmentId);

    await waitForOrderStatus(order.orderId, 'completed');
    const completed = await getShopOrder(seller.agent, seller.shopPublicId, order.orderPublicId);
    expect(completed.order.status).toBe('completed');
    expect(completed.order.fulfillment.status).toBe('delivered');
  });

  it('amends prepared quantities and releases the capacity', async () => {
    const seller = await createSeller('seller-amend-qty');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Amend Jar',
      sku: `AMD-${Date.now()}`,
      priceMinor: 1999,
      stock: 10,
    });

    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 3,
      status: 'paid',
    });
    await assignGroup({ order, shopId: seller.shopId });

    const prepared = await prepareShipmentRequest(seller, order.orderPublicId, {}).expect(201);
    const shipmentId = (prepared.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!.id;

    const overAmend = await seller.agent
      .patch(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments/${shipmentId}`)
      .set('Idempotency-Key', randomUUID())
      .send({ items: [{ order_item_id: order.orderItemId, quantity: 5 }] })
      .expect(409);
    expect(overAmend.body.code).toBe('SHIPMENT_QUANTITY_EXCEEDED');

    const amended = await seller.agent
      .patch(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments/${shipmentId}`)
      .set('Idempotency-Key', randomUUID())
      .send({ items: [{ order_item_id: order.orderItemId, quantity: 1 }] })
      .expect(200);
    expect(amended.body.fulfillment.progress).toMatchObject({
      ordered: 3,
      prepared: 1,
      outstanding: 3,
    });

    const released = await prepareShipmentRequest(seller, order.orderPublicId, {
      items: [{ order_item_id: order.orderItemId, quantity: 2 }],
    }).expect(201);
    expect(released.body.fulfillment.progress).toMatchObject({
      ordered: 3,
      prepared: 3,
      outstanding: 3,
    });
  });

  it('replays an identical preparation command without creating a second consignment', async () => {
    const seller = await createSeller('seller-duplicate');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Duplicate Box',
      sku: `DUP-${Date.now()}`,
      priceMinor: 1999,
      stock: 5,
    });

    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 2,
      status: 'paid',
    });
    await assignGroup({ order, shopId: seller.shopId });

    const idempotencyKey = randomUUID();
    const body = {
      items: [{ order_item_id: order.orderItemId, quantity: 1 }],
      carrier: 'usps',
    };

    const first = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments`)
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
      .expect(201);
    const replay = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments`)
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
      .expect(201);

    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect((replay.body.fulfillment as Fulfillment).groups[0]!.shipments).toHaveLength(1);
    expect((replay.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!.id).toBe(
      (first.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!.id,
    );
    expect(await activePreparedQuantity(order.orderId)).toBe(1);
  });

  it('does not let concurrent preparation claim the same remaining units', async () => {
    const seller = await createSeller('seller-race-prepare');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Race Crate',
      sku: `RACE-${Date.now()}`,
      priceMinor: 1999,
      stock: 5,
    });

    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 2,
      status: 'paid',
    });
    await assignGroup({ order, shopId: seller.shopId });

    const body = { items: [{ order_item_id: order.orderItemId, quantity: 2 }] };
    const [first, second] = await Promise.all([
      prepareShipmentRequest(seller, order.orderPublicId, body),
      prepareShipmentRequest(seller, order.orderPublicId, body),
    ]);

    const responses = [first, second];
    const accepted = responses.filter(response => response.status === 201);
    const rejected = responses.filter(response => response.status === 409);
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.body.code).toBe('SHIPMENT_QUANTITY_EXCEEDED');

    expect(await activePreparedQuantity(order.orderId)).toBe(2);
    const shipmentCount = await sql.query(
      'select count(*)::int as count from "shipments" where "order_id" = $1',
      [order.orderId],
    );
    expect(shipmentCount.rows[0].count).toBe(1);
  });

  it('serializes whole-order cancellation against carrier handover', async () => {
    const seller = await createSeller('seller-race-cancel');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Race Parcel',
      sku: `RACEC-${Date.now()}`,
      priceMinor: 1999,
      stock: 5,
    });

    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'paid',
    });
    await assignGroup({ order, shopId: seller.shopId });

    const prepared = await prepareShipmentRequest(seller, order.orderPublicId, {
      carrier: 'usps',
      tracking_number: uspsTrackingNumber(),
    }).expect(201);
    const shipmentId = (prepared.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!.id;

    const [dispatchResult, cancelResult] = await Promise.all([
      handoverRequest(seller, order.orderPublicId, shipmentId),
      cancelOrderRequest(seller, order.orderPublicId, 'Race with handover'),
    ]);

    const detail = await getShopOrder(seller.agent, seller.shopPublicId, order.orderPublicId);
    const shipmentStatus = detail.order.fulfillment.groups[0]!.shipments[0]!.status;

    if (detail.order.status === 'canceled') {
      expect(cancelResult.status).toBe(200);
      expect(dispatchResult.status).toBe(400);
      expect(detail.order.fulfillment.status).toBe('canceled');
      expect(shipmentStatus).toBe('voided');
      expect(detail.order.fulfillment.progress).toMatchObject({
        ordered: 1,
        dispatched: 0,
        delivered: 0,
        canceled: 1,
        outstanding: 0,
      });
    }
    else {
      expect(detail.order.status).toBe('paid');
      expect(dispatchResult.status).toBe(201);
      expect(cancelResult.status).toBe(400);
      expect(shipmentStatus).toBe('dispatched');
    }

    // At most one outcome owns the unit: never both canceled and dispatched.
    expect(detail.order.status === 'canceled' && shipmentStatus === 'dispatched').toBe(false);
  });

  it('treats prepared labels as cancellable and reports the canceled obligation', async () => {
    const seller = await createSeller('seller-label-cancel');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Label Cushion',
      sku: `LBL-${Date.now()}`,
      priceMinor: 1999,
      stock: 5,
    });

    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 2,
      status: 'paid',
    });
    await assignGroup({ order, shopId: seller.shopId });

    await prepareShipmentRequest(seller, order.orderPublicId, {
      carrier: 'usps',
      tracking_number: '9400111899223100001234',
    }).expect(201);

    await cancelOrderRequest(seller, order.orderPublicId, 'Label only').expect(200);

    const detail = await getShopOrder(seller.agent, seller.shopPublicId, order.orderPublicId);
    expect(detail.order.status).toBe('canceled');
    expect(detail.order.fulfillment.status).toBe('canceled');
    expect(detail.order.fulfillment.progress).toMatchObject({
      ordered: 2,
      prepared: 0,
      dispatched: 0,
      delivered: 0,
      canceled: 2,
      outstanding: 0,
    });
    expect(detail.order.fulfillment.groups[0]!.shipments[0]!.status).toBe('voided');
  });

  it('refuses whole-order cancellation after a partial dispatch', async () => {
    const seller = await createSeller('seller-partial-cancel');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Partial Cancel Rug',
      sku: `PCX-${Date.now()}`,
      priceMinor: 1999,
      stock: 5,
    });

    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 2,
      status: 'paid',
    });
    await assignGroup({ order, shopId: seller.shopId });

    const prepared = await prepareShipmentRequest(seller, order.orderPublicId, {
      items: [{ order_item_id: order.orderItemId, quantity: 1 }],
      carrier: 'usps',
      tracking_number: uspsTrackingNumber(),
    }).expect(201);
    const shipmentId = (prepared.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!.id;
    // Dispatch created by a Handover Declaration still blocks cancellation.
    await handoverRequest(seller, order.orderPublicId, shipmentId).expect(201);

    const cancel = await cancelOrderRequest(seller, order.orderPublicId, 'Too late');
    expect(cancel.status).toBe(400);
    expect(cancel.body.code).toBe('SELLER_SHIPPED_ORDER_CANCEL_NOT_ALLOWED');

    const detail = await getShopOrder(seller.agent, seller.shopPublicId, order.orderPublicId);
    expect(detail.order.status).toBe('paid');

    // The remainder is still preparable: the refused cancellation did not void it.
    const remainder = await prepareShipmentRequest(seller, order.orderPublicId, {
      items: [{ order_item_id: order.orderItemId, quantity: 1 }],
    }).expect(201);
    expect((remainder.body.fulfillment as Fulfillment).progress).toMatchObject({
      ordered: 2,
      prepared: 1,
      dispatched: 1,
      outstanding: 1,
    });
  });

  it('lists the carrier catalogue for authenticated sellers and rejects anonymous access', async () => {
    const seller = await createSeller('seller-carriers');

    await request(app.getHttpServer())
      .get(`${API_PREFIX}/carriers`)
      .expect(401);

    const response = await seller.agent
      .get(`${API_PREFIX}/carriers`)
      .expect(200);

    expect(response.body).toEqual({
      carriers: [
        {
          code: 'usps',
          name: 'USPS',
          tracking_pattern: '^9\\d{21}$',
          tracking_hint: '22 digits starting with 9',
          observable: true,
          label_supported: true,
        },
        {
          code: 'dhl',
          name: 'DHL',
          tracking_pattern: '^\\d{10}$',
          tracking_hint: '10 digits',
          observable: true,
          label_supported: true,
        },
        {
          code: 'vnpost',
          name: 'VNPOST',
          tracking_pattern: '^[A-Z]{2}\\d{9}VN$',
          tracking_hint: 'two letters, nine digits, then VN',
          observable: true,
          label_supported: true,
        },
        {
          code: 'other',
          name: 'Other',
          tracking_pattern: null,
          tracking_hint: null,
          observable: false,
          label_supported: false,
        },
      ],
    });
  });

  it('quotes shipment rates in the shop currency without writing fulfillment or ledger rows', async () => {
    const seller = await createSeller('seller-rate-quotes');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Rate Quote Parcel',
      sku: `RATE-${Date.now()}`,
      priceMinor: 1999,
      stock: 2,
    });
    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'paid',
    });

    const expiresAt = new Date(Date.now() + (15 * 60 * 1000)).toISOString();
    const fixedRates = (['usps', 'dhl', 'vnpost'] as const).flatMap((carrier, carrierIndex) =>
      (['standard', 'express'] as const).map((service, serviceIndex) => ({
        quoteId: `rq_${randomUUID()}`,
        carrier,
        service,
        priceMinor: 500 + (carrierIndex * 100) + (serviceIndex * 50),
        currency: 'USD',
        estimatedDays: service === 'standard' ? { min: 3, max: 5 } : { min: 1, max: 2 },
        expiresAt,
      })),
    );
    carrierParcelGateway.quoteRates.mockResolvedValueOnce([
      ...fixedRates,
      { ...fixedRates[0]!, carrier: 'other' },
    ]);
    carrierParcelGateway.registerParcel.mockClear();

    const countRows = async (table: string): Promise<number> => {
      const result = await sql.query<{ count: string }>(`select count(*) from "${table}"`);
      return Number(result.rows[0].count);
    };
    const before = {
      shipments: await countRows('shipments'),
      updates: await countRows('shipment_updates'),
      journalEntries: await countRows('journal_entries'),
      postings: await countRows('postings'),
    };

    const response = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipment-rates`)
      .send({
        weight_grams: 500,
        length_cm: 10,
        width_cm: 10,
        height_cm: 10,
      })
      .expect(200);

    expect(response.body.rates).toHaveLength(6);
    expect(response.body.rates).toEqual(fixedRates.map((rate) => ({
      quote_id: rate.quoteId,
      carrier: rate.carrier,
      service: rate.service,
      price_minor: rate.priceMinor,
      currency: rate.currency,
      estimated_days: rate.estimatedDays,
      expires_at: rate.expiresAt,
    })));
    expect(carrierParcelGateway.quoteRates).toHaveBeenCalledWith({
      weightGrams: 500,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
      currency: 'USD',
    });

    // Quoting is read-only: the parcel integration, shipment aggregate, and
    // ledger are untouched.
    expect(carrierParcelGateway.registerParcel).not.toHaveBeenCalled();
    expect(await countRows('shipments')).toBe(before.shipments);
    expect(await countRows('shipment_updates')).toBe(before.updates);
    expect(await countRows('journal_entries')).toBe(before.journalEntries);
    expect(await countRows('postings')).toBe(before.postings);
  });

  it('rejects a malformed package and reports an unavailable carrier as 503', async () => {
    const seller = await createSeller('seller-rate-quotes-errors');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Rate Quote Errors',
      sku: `RATE-ERR-${Date.now()}`,
      priceMinor: 1999,
      stock: 2,
    });
    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'paid',
    });
    const ratesPath = `${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipment-rates`;

    await seller.agent
      .post(ratesPath)
      .send({
        weight_grams: 0,
        length_cm: 10,
        width_cm: 10,
        height_cm: 10,
      })
      .expect(400);

    await seller.agent
      .post(ratesPath)
      .send({ weight_grams: 500, length_cm: 10 })
      .expect(400);

    await seller.agent
      .post(ratesPath)
      .send({
        weight_grams: 500.5,
        length_cm: 10,
        width_cm: 10,
        height_cm: 10,
      })
      .expect(400);

    carrierParcelGateway.quoteRates.mockRejectedValueOnce(
      new CarrierRateQuoteUnavailableError(),
    );

    const response = await seller.agent
      .post(ratesPath)
      .send({
        weight_grams: 500,
        length_cm: 10,
        width_cm: 10,
        height_cm: 10,
      })
      .expect(503);

    expect(response.body).toMatchObject({
      status_code: 503,
      code: 'CARRIER_RATES_UNAVAILABLE',
      message: 'Shipping rates are temporarily unavailable',
    });
  });

  it('purchases a label, prepares the shipment, and stores the PDF', async () => {
    const seller = await createSeller('seller-label-purchase');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Label Purchase Parcel',
      sku: `LABEL-${Date.now()}`,
      priceMinor: 1999,
      stock: 2,
    });
    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'paid',
    });
    await assignGroup({ order, shopId: seller.shopId });

    const quoteId = `rq_${randomUUID()}`;
    carrierParcelGateway.quoteRates.mockResolvedValueOnce([
      {
        quoteId,
        carrier: 'usps',
        service: 'standard',
        priceMinor: 980,
        currency: 'USD',
        estimatedDays: { min: 3, max: 5 },
        expiresAt: new Date(Date.now() + (15 * 60 * 1000)).toISOString(),
      },
    ]);

    await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipment-rates`)
      .send({
        weight_grams: 500,
        length_cm: 10,
        width_cm: 10,
        height_cm: 10,
      })
      .expect(200);

    const label = purchasedLabelFixture(quoteId);
    carrierParcelGateway.purchaseLabel.mockReset();
    carrierParcelGateway.purchaseLabel.mockResolvedValueOnce(label);

    const response = await purchaseLabelRequest(seller, order.orderPublicId, {
      quote_id: quoteId,
      items: [{ order_item_id: order.orderItemId, quantity: 1 }],
    }).expect(201);

    expect(carrierParcelGateway.purchaseLabel).toHaveBeenLastCalledWith({ quoteId, currency: 'USD' });

    const shipment = (response.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!;
    expect(shipment.status).toBe('prepared');
    expect(shipment.carrier).toBe('usps');
    expect(shipment.carrier_name).toBe('USPS');
    expect(shipment.tracking_number).toBe(label.trackingNumber);
    expect(shipment.dispatched_at).toBeNull();
    expect(shipment.items).toEqual([{ order_item_id: order.orderItemId, quantity: 1 }]);
    expect(shipment.label).toMatchObject({
      service: 'standard',
      status: 'purchased',
      price_minor: 980,
      currency: 'USD',
    });
    expect(shipment.label!.public_id).toMatch(/^lbl_[0-9a-f]{12}$/);

    // A labeled Shipment must be undone through its label refund.
    const voidAttempt = await seller.agent
      .delete(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments/${shipment.id}`)
      .set('Idempotency-Key', randomUUID())
      .expect(409);
    expect(voidAttempt.body).toMatchObject({ code: 'SHIPMENT_LABEL_REFUND_REQUIRED' });

    const stored = await sql.query<{
      id: string;
      shipment_id: string;
      public_id: string;
      quote_id: string;
      carrier: string;
      service: string;
      tracking_number: string;
      price_minor: number;
      currency: string;
      pdf_storage_key: string;
      status: string;
    }>(
      `select "id", "shipment_id", "public_id", "quote_id", "carrier", "service",
              "tracking_number", "price_minor", "currency", "pdf_storage_key", "status"
         from "shipment_labels"
        where "order_id" = $1`,
      [order.orderId],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({
      public_id: shipment.label!.public_id,
      quote_id: quoteId,
      carrier: 'usps',
      service: 'standard',
      tracking_number: label.trackingNumber,
      price_minor: 980,
      currency: 'USD',
      status: 'purchased',
    });

    const internalShopId = await resolveShopId(sql, seller.shopId);
    expect(stored.rows[0]!.pdf_storage_key)
      .toBe(`labels/${internalShopId}/${shipment.label!.public_id}.pdf`);
    expect(await readFile(path.join(storageRoot, stored.rows[0]!.pdf_storage_key)))
      .toEqual(label.pdf);

    // The purchase prepares a parcel; it never dispatches it.
    const persistedShipment = await sql.query<{
      status: string;
      dispatched_at: Date | null;
      carrier: string;
      tracking_number: string;
    }>(
      `select "status", "dispatched_at", "carrier", "tracking_number"
         from "shipments"
        where "id" = $1`,
      [stored.rows[0]!.shipment_id],
    );
    expect(persistedShipment.rows[0]).toEqual({
      status: 'prepared',
      dispatched_at: null,
      carrier: 'usps',
      tracking_number: label.trackingNumber,
    });

    const updates = await readShipmentUpdates(shipment.id);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      status: 'prepared',
      actor_type: 'seller',
      source: 'seller',
      note: 'Label purchased',
    });
  });

  it('rejects impossible quantities before buying the carrier label', async () => {
    const seller = await createSeller('seller-label-preflight');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Label Preflight Parcel',
      sku: `LABEL-PREFLIGHT-${Date.now()}`,
      priceMinor: 1999,
      stock: 2,
    });
    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'paid',
    });
    await assignGroup({ order, shopId: seller.shopId });

    const quoteId = `rq_${randomUUID()}`;
    carrierParcelGateway.purchaseLabel.mockReset();
    carrierParcelGateway.purchaseLabel.mockReset();
    carrierParcelGateway.purchaseLabel.mockResolvedValueOnce(
      purchasedLabelFixture(quoteId),
    );

    const response = await purchaseLabelRequest(seller, order.orderPublicId, {
      quote_id: quoteId,
      items: [{ order_item_id: order.orderItemId, quantity: 2 }],
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(carrierParcelGateway.purchaseLabel).not.toHaveBeenCalled();
    const labels = await sql.query('select 1 from "shipment_labels" where "order_id" = $1', [order.orderId]);
    expect(labels.rows).toHaveLength(0);

    const shipments = await sql.query('select 1 from "shipments" where "order_id" = $1', [order.orderId]);
    expect(shipments.rows).toHaveLength(0);
  });

  it('replays an idempotent label purchase without buying a second label', async () => {
    const seller = await createSeller('seller-label-idempotent');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Label Idempotency Parcel',
      sku: `LABEL-IDEMPOTENT-${Date.now()}`,
      priceMinor: 1999,
      stock: 2,
    });
    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'paid',
    });
    await assignGroup({ order, shopId: seller.shopId });

    const quoteId = `rq_${randomUUID()}`;
    carrierParcelGateway.purchaseLabel.mockReset();
    carrierParcelGateway.purchaseLabel.mockReset();
    carrierParcelGateway.purchaseLabel.mockResolvedValueOnce(
      purchasedLabelFixture(quoteId),
    );
    const idempotencyKey = randomUUID();
    const body = {
      quote_id: quoteId,
      items: [{ order_item_id: order.orderItemId, quantity: 1 }],
    };

    const first = await purchaseLabelRequest(
      seller,
      order.orderPublicId,
      body,
      idempotencyKey,
    ).expect(201);
    const replay = await purchaseLabelRequest(
      seller,
      order.orderPublicId,
      body,
      idempotencyKey,
    ).expect(201);

    expect(replay.body).toEqual(first.body);
    expect(carrierParcelGateway.purchaseLabel).toHaveBeenCalledTimes(1);

    const labels = await sql.query<{ count: number }>(
      'select count(*)::int as count from "shipment_labels" where "order_id" = $1',
      [order.orderId],
    );
    expect(labels.rows[0]!.count).toBe(1);
    const shipments = await sql.query<{ count: number }>(
      'select count(*)::int as count from "shipments" where "order_id" = $1',
      [order.orderId],
    );
    expect(shipments.rows[0]!.count).toBe(1);
  });

  it('maps a refused quote to 409 and a carrier outage to 503 without writing rows', async () => {
    const seller = await createSeller('seller-label-errors');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Label Error Parcel',
      sku: `LABEL-ERROR-${Date.now()}`,
      priceMinor: 1999,
      stock: 2,
    });
    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'paid',
    });
    await assignGroup({ order, shopId: seller.shopId });
    const body = {
      quote_id: `rq_${randomUUID()}`,
      items: [{ order_item_id: order.orderItemId, quantity: 1 }],
    };

    carrierParcelGateway.purchaseLabel.mockReset();
    carrierParcelGateway.purchaseLabel.mockRejectedValueOnce(
      new CarrierLabelQuoteRejectedError(),
    );
    const expired = await purchaseLabelRequest(seller, order.orderPublicId, body)
      .expect(409);
    expect(expired.body).toMatchObject({
      status_code: 409,
      code: 'RATE_QUOTE_EXPIRED',
      message: 'This rate quote has expired or was already used; request new rates',
    });

    carrierParcelGateway.purchaseLabel.mockReset();
    carrierParcelGateway.purchaseLabel.mockRejectedValueOnce(
      new CarrierLabelPurchaseUnavailableError(),
    );
    const unavailable = await purchaseLabelRequest(seller, order.orderPublicId, body)
      .expect(503);
    expect(unavailable.body).toMatchObject({
      status_code: 503,
      code: 'CARRIER_LABEL_UNAVAILABLE',
      message: 'Carrier labels are temporarily unavailable',
    });

    const shipments = await sql.query<{ count: number }>(
      'select count(*)::int as count from "shipments" where "order_id" = $1',
      [order.orderId],
    );
    expect(shipments.rows[0]!.count).toBe(0);
    const labels = await sql.query<{ count: number }>(
      'select count(*)::int as count from "shipment_labels" where "order_id" = $1',
      [order.orderId],
    );
    expect(labels.rows[0]!.count).toBe(0);
  });

  it('guards label downloads by shop, authentication, and existence', async () => {
    const seller = await createSeller('seller-label-download');
    const otherSeller = await createSeller('seller-label-download-other');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Label Download Parcel',
      sku: `LABEL-DOWNLOAD-${Date.now()}`,
      priceMinor: 1999,
      stock: 4,
    });
    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'paid',
    });
    await assignGroup({ order, shopId: seller.shopId });

    const quoteId = `rq_${randomUUID()}`;
    const label = purchasedLabelFixture(quoteId);
    carrierParcelGateway.purchaseLabel.mockReset();
    carrierParcelGateway.purchaseLabel.mockResolvedValueOnce(label);
    const purchase = await purchaseLabelRequest(seller, order.orderPublicId, {
      quote_id: quoteId,
      items: [{ order_item_id: order.orderItemId, quantity: 1 }],
    }).expect(201);
    const shipment = (purchase.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!;

    const downloadPath = `${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments/${shipment.id}/label.pdf`;
    const download = await seller.agent
      .get(downloadPath)
      .buffer(true)
      .parse((stream, callback) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(download.headers['content-type']).toContain('application/pdf');
    expect(download.headers['content-disposition'])
      .toBe('attachment; filename="label.pdf"');
    expect(download.body).toEqual(label.pdf);

    await otherSeller.agent.get(downloadPath).expect(403);

    await request(app.getHttpServer()).get(downloadPath).expect(401);

    // A prepared shipment without a purchased label has no PDF to stream.
    const unlabeledOrder = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'paid',
    });
    await assignGroup({ order: unlabeledOrder, shopId: seller.shopId });
    const unlabeled = await prepareShipmentRequest(seller, unlabeledOrder.orderPublicId, {
      items: [{ order_item_id: unlabeledOrder.orderItemId, quantity: 1 }],
      carrier: 'usps',
      tracking_number: uspsTrackingNumber(),
    }).expect(201);
    const unlabeledShipment = (unlabeled.body.fulfillment as Fulfillment)
      .groups[0]!.shipments[0]!;

    const missing = await seller.agent
      .get(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${unlabeledOrder.orderPublicId}/fulfillment/shipments/${unlabeledShipment.id}/label.pdf`)
      .expect(404);
    expect(missing.body).toMatchObject({
      code: 'SHIPMENT_LABEL_NOT_FOUND',
    });
  });

  it('exposes the purchased label with carrier and tracking to the buyer', async () => {
    const seller = await createSeller('seller-label-buyer-read');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Label Buyer Parcel',
      sku: `LABEL-BUYER-${Date.now()}`,
      priceMinor: 1999,
      stock: 2,
    });
    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'paid',
    });
    await assignGroup({ order, shopId: seller.shopId });

    const quoteId = `rq_${randomUUID()}`;
    const label = purchasedLabelFixture(quoteId);
    carrierParcelGateway.purchaseLabel.mockReset();
    carrierParcelGateway.purchaseLabel.mockResolvedValueOnce(label);
    await purchaseLabelRequest(seller, order.orderPublicId, {
      quote_id: quoteId,
      items: [{ order_item_id: order.orderItemId, quantity: 1 }],
    }).expect(201);

    const buyerView = await buyer.agent
      .get(`${API_PREFIX}/me/orders/${order.orderPublicId}`)
      .expect(200);
    const buyerShipment = buyerView.body.order_shop.fulfillment
      .groups[0]!.shipments[0]! as Shipment;

    expect(buyerShipment.carrier).toBe('usps');
    expect(buyerShipment.tracking_number).toBe(label.trackingNumber);
    // The buyer sees the parcel, not the seller's postage price.
    expect(buyerShipment.label).toBeUndefined();

    const buyerList = await buyer.agent
      .get(`${API_PREFIX}/me/orders`)
      .expect(200);
    const listed = (buyerList.body.order_shops as Array<{
      id: string;
      fulfillment: { groups: Array<{ shipments: Shipment[] }> };
    }>).find(entry => entry.id === order.orderPublicId);
    expect(listed?.fulfillment.groups[0]?.shipments[0]?.label).toBeUndefined();
  });

  it('books a Label Charge against available Seller Payable and lists it as a label_charge transaction', async () => {
    const seller = await createSeller('seller-label-charge');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Label Charge Parcel',
      sku: `LABEL-CHARGE-${Date.now()}`,
      priceMinor: 1999,
      stock: 2,
    });
    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'paid',
    });
    await assignGroup({ order, shopId: seller.shopId });

    expect((await readSellerPayable(seller)).available_minor).toBe(0);

    const { label, shipment } = await buyLabel(seller, order);

    // The Local label id and the carrier's id are both retained: the seller
    // faces the former, the carrier refunds by the latter.
    const storedLabel = await sql.query<{ carrier_label_id: string }>(
      'select "carrier_label_id" from "shipment_labels" where "public_id" = $1',
      [shipment.label!.public_id],
    );
    expect(storedLabel.rows[0]!.carrier_label_id).toBe(label.labelId);

    // The charge is a durable outbox fact, not an inline ledger write.
    expect((await readSellerPayable(seller)).available_minor).toBe(0);
    const pendingCharge = await sql.query<{ status: string }>(
      `select "status" from "outbox_events"
        where "event_name" = 'label.charged' and "aggregate_id" = $1`,
      [shipment.label!.public_id],
    );
    expect(pendingCharge.rows).toEqual([{ status: 'pending' }]);

    await financeMoneyEventProcessor.processPendingEvents();

    const payable = await readSellerPayable(seller);
    expect(payable.currency).toBe('USD');
    expect(payable.available_minor).toBe(-980);

    const rows = await listLabelChargeRows(seller);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'label_charge',
      status: 'deducted',
      reference: order.orderPublicId,
      order_amount_minor: null,
      fees_minor: null,
      net_amount_minor: -980,
      currency: 'USD',
      payout_number: null,
      source: null,
    });
    expect(rows[0]!.order_number).toEqual(expect.any(String));

    const journal = await sql.query<{ count: number; money_event_kind: string }>(
      `select count(*)::int as count, min("money_event_kind") as money_event_kind
         from "journal_entries"
        where "money_event_key" = $1`,
      [`label.charge:${shipment.label!.public_id}`],
    );
    expect(journal.rows[0]).toEqual({ count: 1, money_event_kind: 'label.charged' });
  });

  it('marks a Label used at the first real carrier scan and rejects its refund', async () => {
    const seller = await createSeller('seller-label-used');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Label Used Parcel',
      sku: `LABEL-USED-${Date.now()}`,
      priceMinor: 1999,
      stock: 2,
    });
    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'paid',
    });
    await assignGroup({ order, shopId: seller.shopId });

    const { shipment } = await buyLabel(seller, order);

    await reportCarrierEvent(seller, order.orderPublicId, shipment.id, 'LABEL_CREATED');
    const afterLabelCreated = await sql.query<{ status: string }>(
      'select "status" from "shipment_labels" where "public_id" = $1',
      [shipment.label!.public_id],
    );
    expect(afterLabelCreated.rows[0]!.status).toBe('purchased');

    await reportCarrierEvent(seller, order.orderPublicId, shipment.id, 'PICKED_UP');

    const afterScan = await sql.query<{ status: string }>(
      'select "status" from "shipment_labels" where "public_id" = $1',
      [shipment.label!.public_id],
    );
    expect(afterScan.rows[0]!.status).toBe('used');

    carrierParcelGateway.refundLabel.mockReset();
    const refund = await refundLabelRequest(seller, order.orderPublicId, shipment.id);

    expect(refund.status).toBe(409);
    expect(refund.body.code).toBe('SHIPMENT_LABEL_ALREADY_USED');
    expect(carrierParcelGateway.refundLabel).not.toHaveBeenCalled();

    const persisted = await sql.query<{ shipment_status: string; label_status: string }>(
      `select s."status" as shipment_status, l."status" as label_status
         from "shipments" s
         join "shipment_labels" l on l."shipment_id" = s."id"
        where s."public_id" = $1`,
      [shipment.id],
    );
    expect(persisted.rows[0]).toEqual({
      shipment_status: 'dispatched',
      label_status: 'used',
    });
    const refundEvents = await sql.query<{ count: number }>(
      `select count(*)::int as count from "outbox_events"
        where "event_name" = 'label.refunded' and "aggregate_id" = $1`,
      [shipment.label!.public_id],
    );
    expect(refundEvents.rows[0]!.count).toBe(0);
  });

  it('refunds an unused Label exactly once, voids its Shipment, and restores the charge', async () => {
    const seller = await createSeller('seller-label-refund');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Label Refund Parcel',
      sku: `LABEL-REFUND-${Date.now()}`,
      priceMinor: 1999,
      stock: 2,
    });
    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'paid',
    });
    await assignGroup({ order, shopId: seller.shopId });

    const { label, shipment } = await buyLabel(seller, order);
    await financeMoneyEventProcessor.processPendingEvents();
    expect((await readSellerPayable(seller)).available_minor).toBe(-980);

    const chargeRows = await listLabelChargeRows(seller);
    expect(chargeRows.find((row) => row.net_amount_minor === -980)).toBeDefined();

    carrierParcelGateway.refundLabel.mockReset();
    carrierParcelGateway.refundLabel.mockResolvedValue(undefined);

    const response = await refundLabelRequest(seller, order.orderPublicId, shipment.id)
      .expect(200);

    expect(carrierParcelGateway.refundLabel).toHaveBeenCalledWith({
      labelId: label.labelId,
    });

    const refunded = (response.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!;
    expect(refunded.status).toBe('voided');
    expect(refunded.label!.status).toBe('voided');
    expect(refunded.items).toEqual([{ order_item_id: order.orderItemId, quantity: 1 }]);
    expect(refunded.updates.map((update) => update.status)).toEqual(['prepared', 'voided']);
    expect((response.body.fulfillment as Fulfillment).status).toBe('unfulfilled');
    expect((response.body.fulfillment as Fulfillment).progress).toMatchObject({
      prepared: 0,
      outstanding: 1,
    });

    // A repeated refund returns the same view without a second carrier call or
    // a second reversal event.
    const replay = await refundLabelRequest(seller, order.orderPublicId, shipment.id)
      .expect(200);
    expect(replay.body.fulfillment).toEqual(response.body.fulfillment);
    expect(carrierParcelGateway.refundLabel).toHaveBeenCalledTimes(1);

    const refundEvents = await sql.query<{ count: number, status: string }>(
      `select count(*)::int as count, min("status") as status from "outbox_events"
        where "event_name" = 'label.refunded' and "aggregate_id" = $1`,
      [shipment.label!.public_id],
    );
    expect(refundEvents.rows[0]).toEqual({ count: 1, status: 'pending' });

    // The buyer no longer sees the refunded parcel; the seller keeps its history.
    const buyerView = await buyer.agent
      .get(`${API_PREFIX}/me/orders/${order.orderPublicId}`)
      .expect(200);
    expect(buyerView.body.order_shop.fulfillment.groups[0]!.shipments).toEqual([]);
    expect((await readShipment(seller, order.orderPublicId, shipment.id)).status).toBe('voided');

    await financeMoneyEventProcessor.processPendingEvents();

    expect((await readSellerPayable(seller)).available_minor).toBe(0);
    const journal = await sql.query<{ count: number }>(
      `select count(*)::int as count from "journal_entries"
        where "money_event_key" = $1`,
      [`label.refund:${shipment.label!.public_id}`],
    );
    expect(journal.rows[0]!.count).toBe(1);

    const processedRefund = await sql.query<{ status: string }>(
      `select "status" from "outbox_events"
        where "event_name" = 'label.refunded' and "aggregate_id" = $1`,
      [shipment.label!.public_id],
    );
    expect(processedRefund.rows).toEqual([{ status: 'processed' }]);

    const refundRows = await listLabelChargeRows(seller);
    expect(refundRows).toHaveLength(2);
    expect(refundRows.map((row) => row.net_amount_minor).sort((left, right) => left - right)).toEqual([-980, 980]);
    expect(refundRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'label_charge', status: 'deducted', net_amount_minor: -980 }),
      expect.objectContaining({ type: 'label_refund', status: 'refunded', net_amount_minor: 980 }),
    ]));

    // The voided quantities are free to prepare again.
    const reprepared = await prepareShipmentRequest(seller, order.orderPublicId, {
      items: [{ order_item_id: order.orderItemId, quantity: 1 }],
    }).expect(201);
    const newShipment = (reprepared.body.fulfillment as Fulfillment).groups[0]!.shipments
      .find((candidate) => candidate.status === 'prepared');
    expect(newShipment).toBeDefined();
    expect(newShipment!.id).not.toBe(shipment.id);
  });

  it('leaves the Label and Shipment untouched when the carrier fails or refuses the refund', async () => {
    const seller = await createSeller('seller-label-refund-errors');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Label Refund Error Parcel',
      sku: `LABEL-REFUND-ERR-${Date.now()}`,
      priceMinor: 1999,
      stock: 2,
    });
    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'paid',
    });
    await assignGroup({ order, shopId: seller.shopId });

    const { shipment } = await buyLabel(seller, order);

    carrierParcelGateway.refundLabel.mockReset();
    carrierParcelGateway.refundLabel.mockRejectedValueOnce(
      new CarrierLabelRefundUnavailableError(),
    );
    const unavailable = await refundLabelRequest(seller, order.orderPublicId, shipment.id);
    expect(unavailable.status).toBe(503);
    expect(unavailable.body.code).toBe('CARRIER_LABEL_UNAVAILABLE');

    carrierParcelGateway.refundLabel.mockRejectedValueOnce(
      new CarrierLabelAlreadyUsedError(),
    );
    const refused = await refundLabelRequest(seller, order.orderPublicId, shipment.id);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('SHIPMENT_LABEL_ALREADY_USED');

    carrierParcelGateway.refundLabel.mockRejectedValueOnce(
      new CarrierLabelNotFoundError(),
    );
    const missing = await refundLabelRequest(seller, order.orderPublicId, shipment.id);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('SHIPMENT_LABEL_NOT_FOUND');

    const persisted = await sql.query<{ shipment_status: string; label_status: string }>(
      `select s."status" as shipment_status, l."status" as label_status
         from "shipments" s
         join "shipment_labels" l on l."shipment_id" = s."id"
        where s."public_id" = $1`,
      [shipment.id],
    );
    expect(persisted.rows[0]).toEqual({
      shipment_status: 'prepared',
      label_status: 'purchased',
    });

    const refundEvents = await sql.query<{ count: number }>(
      `select count(*)::int as count from "outbox_events"
        where "event_name" = 'label.refunded' and "aggregate_id" = $1`,
      [shipment.label!.public_id],
    );
    expect(refundEvents.rows[0]!.count).toBe(0);
    const refundJournal = await sql.query<{ count: number }>(
      `select count(*)::int as count from "journal_entries"
        where "money_event_key" = $1`,
      [`label.refund:${shipment.label!.public_id}`],
    );
    expect(refundJournal.rows[0]!.count).toBe(0);
  });

  it('refunds a purchased label after the order was canceled', async () => {
    const seller = await createSeller('seller-label-canceled-refund');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Canceled Label Parcel',
      sku: `LABEL-CANCEL-${Date.now()}`,
      priceMinor: 1999,
      stock: 2,
    });
    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'paid',
    });
    await assignGroup({ order, shopId: seller.shopId });

    const { shipment } = await buyLabel(seller, order);
    await financeMoneyEventProcessor.processPendingEvents();
    expect((await readSellerPayable(seller)).available_minor).toBe(-980);

    await cancelOrderRequest(seller, order.orderPublicId, 'seller cannot ship').expect(200);

    const refund = await refundLabelRequest(seller, order.orderPublicId, shipment.id).expect(200);
    expect((refund.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!.label!.status)
      .toBe('voided');

    await financeMoneyEventProcessor.processPendingEvents();

    expect((await readSellerPayable(seller)).available_minor).toBe(0);
    const reversal = await sql.query<{ count: number }>(
      'select count(*)::int as count from "journal_entries" where "money_event_key" = $1',
      [`label.refund:${shipment.label!.public_id}`],
    );
    expect(reversal.rows[0]!.count).toBe(1);
  });

  it('issues a distinct label id for every purchase', async () => {
    const seller = await createSeller('seller-label-unique');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Label Uniqueness Parcel',
      sku: `LABEL-UNIQUE-${Date.now()}`,
      priceMinor: 1999,
      stock: 4,
    });

    const publicIds: string[] = [];

    for (const quantity of [1, 1]) {
      const order = await seedOrder({
        seller,
        buyer,
        productId,
        inventoryId,
        quantity,
        status: 'paid',
      });
      await assignGroup({ order, shopId: seller.shopId });
      const quoteId = `rq_${randomUUID()}`;
      carrierParcelGateway.purchaseLabel.mockReset();
      carrierParcelGateway.purchaseLabel.mockResolvedValueOnce(
        purchasedLabelFixture(quoteId),
      );

      const response = await purchaseLabelRequest(seller, order.orderPublicId, {
        quote_id: quoteId,
        items: [{ order_item_id: order.orderItemId, quantity }],
      }).expect(201);
      publicIds.push(
        (response.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!.label!.public_id,
      );
    }

    expect(new Set(publicIds).size).toBe(2);
  });


  it('validates carrier tracking numbers and reports the resolved carrier', async () => {
    const seller = await createSeller('seller-carrier-codes');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Carrier Crate',
      sku: `CAR-${Date.now()}`,
      priceMinor: 1999,
      stock: 10,
    });

    async function prepareFor(carrier: string, trackingNumber: string) {
      const order = await seedOrder({
        seller,
        buyer,
        productId,
        inventoryId,
        quantity: 1,
        status: 'paid',
      });
      await assignGroup({ order, shopId: seller.shopId });

      return prepareShipmentRequest(seller, order.orderPublicId, {
        carrier,
        tracking_number: trackingNumber,
      });
    }

    const unknownCarrier = await prepareFor('fedex', '1234567890');
    expect(unknownCarrier.status).toBe(400);
    expect(unknownCarrier.body.code).toBe('UNSUPPORTED_CARRIER');

    const mismatchedNumber = await prepareFor('usps', 'TRACK-1');
    expect(mismatchedNumber.status).toBe(400);
    expect(mismatchedNumber.body.code).toBe('INVALID_CARRIER_TRACKING_NUMBER');

    const matchingNumber = await prepareFor('usps', '  9400111899223100001234  ');
    expect(matchingNumber.status).toBe(201);
    expect(matchingNumber.body.fulfillment.groups[0].shipments[0]).toMatchObject({
      carrier: 'usps',
      carrier_name: 'USPS',
      carrier_observable: true,
      tracking_number: '9400111899223100001234',
    });

    const otherCarrier = await prepareFor('other', 'ARBITRARY-123');
    expect(otherCarrier.status).toBe(201);
    expect(otherCarrier.body.fulfillment.groups[0].shipments[0]).toMatchObject({
      carrier: 'other',
      carrier_name: 'Other',
      carrier_observable: false,
      tracking_number: 'ARBITRARY-123',
    });

    // Amend validates the resulting carrier+tracking pair, not only the fields sent.
    const amendOrder = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'paid',
    });
    await assignGroup({ order: amendOrder, shopId: seller.shopId });
    const prepared = await prepareShipmentRequest(seller, amendOrder.orderPublicId, {
      carrier: 'usps',
      tracking_number: '9400111899223100001234',
    }).expect(201);
    const shipmentId = (prepared.body.fulfillment as Fulfillment)
      .groups[0]!.shipments[0]!.id;

    const invalidAmend = await seller.agent
      .patch(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${amendOrder.orderPublicId}/fulfillment/shipments/${shipmentId}`)
      .set('Idempotency-Key', randomUUID())
      .send({ tracking_number: 'NOT-A-USPS-NUMBER' });
    expect(invalidAmend.status).toBe(400);
    expect(invalidAmend.body.code).toBe('INVALID_CARRIER_TRACKING_NUMBER');

    const validAmend = await seller.agent
      .patch(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${amendOrder.orderPublicId}/fulfillment/shipments/${shipmentId}`)
      .set('Idempotency-Key', randomUUID())
      .send({ carrier: 'vnpost', tracking_number: 'EA123456789VN' })
      .expect(200);
    expect(validAmend.body.fulfillment.groups[0].shipments[0]).toMatchObject({
      carrier: 'vnpost',
      carrier_name: 'VNPOST',
      carrier_observable: true,
      tracking_number: 'EA123456789VN',
    });
  });

  it('rejects a number with no carrier and invented carriers on every seller path', async () => {
    const seller = await createSeller('seller-carrier-loopholes');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Carrier Loophole Crate',
      sku: `CRL-${Date.now()}`,
      priceMinor: 1999,
      stock: 10,
    });

    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'paid',
    });
    await assignGroup({ order, shopId: seller.shopId });

    // A number cannot be validated without its carrier, so it is not recordable.
    const withoutCarrier = await prepareShipmentRequest(seller, order.orderPublicId, {
      tracking_number: 'ARBITRARY-1',
    });
    expect(withoutCarrier.status).toBe(400);
    expect(withoutCarrier.body.code).toBe('INVALID_CARRIER_TRACKING_NUMBER');

    const prepared = await prepareShipmentRequest(seller, order.orderPublicId, {
      carrier: 'usps',
      tracking_number: uspsTrackingNumber(),
    }).expect(201);
    const shipmentId = (prepared.body.fulfillment as Fulfillment)
      .groups[0]!.shipments[0]!.id;

    const inventedCarrier = await seller.agent
      .patch(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments/${shipmentId}`)
      .set('Idempotency-Key', randomUUID())
      .send({ carrier: 'fedex' });
    expect(inventedCarrier.status).toBe(400);
    expect(inventedCarrier.body.code).toBe('UNSUPPORTED_CARRIER');

    const mismatchedTracking = await seller.agent
      .patch(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments/${shipmentId}`)
      .set('Idempotency-Key', randomUUID())
      .send({ tracking_number: 'TRACK-1' });
    expect(mismatchedTracking.status).toBe(400);
    expect(mismatchedTracking.body.code).toBe('INVALID_CARRIER_TRACKING_NUMBER');

    // No seller path can write transit or delivery: the journey command is gone.
    const removedJourney = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments/${shipmentId}/journey`)
      .set('Idempotency-Key', randomUUID())
      .send({ status: 'delivered' });
    expect(removedJourney.status).toBe(404);
  });

  it('rejects unsigned carrier events and ignores duplicates and unknown tracking', async () => {
    const seller = await createSeller('seller-carrier-ingress');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Carrier Ingress Parcel',
      sku: `ING-${Date.now()}`,
      priceMinor: 1999,
      stock: 5,
    });

    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'paid',
    });
    await assignGroup({ order, shopId: seller.shopId });

    const trackingNumber = uspsTrackingNumber();
    const prepared = await prepareShipmentRequest(seller, order.orderPublicId, {
      carrier: 'usps',
      tracking_number: trackingNumber,
    }).expect(201);
    const shipmentId = (prepared.body.fulfillment as Fulfillment)
      .groups[0]!.shipments[0]!.id;

    const pickupEvent = carrierEventBody({
      trackingNumber,
      eventCode: 'PICKED_UP',
      occurredAt: '2026-10-31T09:00:00.000Z',
    });

    const missingSignature = await carrierEventRequest(pickupEvent, { signature: null })
      .expect(401);
    expect(missingSignature.body.code).toBe('INVALID_CARRIER_SIGNATURE');

    const wrongSecret = await carrierEventRequest(pickupEvent, {
      signature: carrierSignature(pickupEvent, 'not-the-carrier-secret'),
    }).expect(401);
    expect(wrongSecret.body.code).toBe('INVALID_CARRIER_SIGNATURE');

    const malformedSignature = await carrierEventRequest(pickupEvent, {
      signature: 'sha256=not-hex',
    }).expect(401);
    expect(malformedSignature.body.code).toBe('INVALID_CARRIER_SIGNATURE');

    // A rejected call writes no evidence beyond the preparation update.
    expect(await readShipmentUpdates(shipmentId)).toHaveLength(1);

    // Unknown routing is acknowledged and ignored, without leaking existence.
    const unknownEvent = carrierEventBody({
      trackingNumber: uspsTrackingNumber(),
      eventCode: 'IN_TRANSIT',
      occurredAt: '2026-10-31T09:01:00.000Z',
    });
    const unknownResponse = await carrierEventRequest(unknownEvent).expect(200);
    expect(unknownResponse.body).toEqual({});
    expect(await readShipmentUpdates(shipmentId)).toHaveLength(1);

    // A bare hex signature is accepted as well as the `sha256=` form.
    const bareSignature = carrierSignature(pickupEvent).replace('sha256=', '');
    const pickupResponse = await carrierEventRequest(pickupEvent, {
      signature: bareSignature,
    }).expect(200);
    expect(pickupResponse.body).toEqual({});

    const afterPickup = await readShipmentUpdates(shipmentId);
    expect(afterPickup).toHaveLength(2);
    expect(afterPickup[1]).toMatchObject({
      status: 'dispatched',
      actor_type: 'carrier',
      actor_id: 'usps',
      source: 'carrier',
      event_code: 'PICKED_UP',
      carrier_event_id: pickupEvent.event_id,
      payload: {
        event_id: pickupEvent.event_id,
        carrier: 'usps',
        tracking_number: trackingNumber,
        event_code: 'PICKED_UP',
        occurred_at: '2026-10-31T09:00:00.000Z',
      },
    });

    // Replaying the same event id is acknowledged without another update.
    const duplicateResponse = await carrierEventRequest(pickupEvent).expect(200);
    expect(duplicateResponse.body).toEqual({});
    expect(await readShipmentUpdates(shipmentId)).toHaveLength(2);

    const view = await getShopOrder(seller.agent, seller.shopId, order.orderPublicId);
    const shipment = view.order.fulfillment.groups[0]!.shipments[0]!;
    expect(shipment.status).toBe('dispatched');
    expect(shipment.updates.find((update) => update.event_code === 'PICKED_UP')).toMatchObject({
      status: 'dispatched',
      actor_type: 'carrier',
      actor_id: 'usps',
      source: 'carrier',
      event_code: 'PICKED_UP',
    });
  });

  it('scopes carrier event ids to their carrier', async () => {
    const seller = await createSeller('seller-carrier-event-scope');
    const buyer = await createBuyer();

    async function preparedWith(
      carrier: 'usps' | 'dhl',
      title: string,
    ): Promise<{ shipmentId: string; trackingNumber: string }> {
      const { productId, inventoryId } = await createProduct({
        seller,
        title,
        sku: `${carrier.toUpperCase()}-${Date.now()}-${Math.floor(Math.random() * 10_000)}`,
        priceMinor: 1999,
        stock: 5,
      });
      const order = await seedOrder({
        seller,
        buyer,
        productId,
        inventoryId,
        quantity: 1,
        status: 'paid',
      });
      await assignGroup({ order, shopId: seller.shopId });

      const trackingNumber = carrier === 'usps'
        ? uspsTrackingNumber()
        : String(Math.floor(Math.random() * 10_000_000_000)).padStart(10, '0');
      const prepared = await prepareShipmentRequest(seller, order.orderPublicId, {
        carrier,
        tracking_number: trackingNumber,
      }).expect(201);

      return {
        shipmentId: (prepared.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!.id,
        trackingNumber,
      };
    }

    const usps = await preparedWith('usps', 'Scoped Event USPS');
    const dhl = await preparedWith('dhl', 'Scoped Event DHL');
    const sharedEventId = randomUUID();
    const occurredAt = '2026-10-31T10:00:00.000Z';

    const uspsEvent = carrierEventBody({
      eventId: sharedEventId,
      carrier: 'usps',
      trackingNumber: usps.trackingNumber,
      eventCode: 'PICKED_UP',
      occurredAt,
    });
    await carrierEventRequest(uspsEvent).expect(200);

    // The same event id from a different carrier is a different event, so it is
    // written rather than swallowed as a replay.
    await carrierEventRequest(carrierEventBody({
      eventId: sharedEventId,
      carrier: 'dhl',
      trackingNumber: dhl.trackingNumber,
      eventCode: 'PICKED_UP',
      occurredAt,
    })).expect(200);

    const uspsUpdates = await readShipmentUpdates(usps.shipmentId);
    const dhlUpdates = await readShipmentUpdates(dhl.shipmentId);
    expect(uspsUpdates).toHaveLength(2);
    expect(dhlUpdates).toHaveLength(2);
    expect(uspsUpdates[1]).toMatchObject({
      status: 'dispatched',
      actor_id: 'usps',
      carrier_event_id: sharedEventId,
    });
    expect(dhlUpdates[1]).toMatchObject({
      status: 'dispatched',
      actor_id: 'dhl',
      carrier_event_id: sharedEventId,
    });

    // A repeated id from the same carrier stays a no-op for that carrier and
    // leaves the other carrier's evidence untouched.
    await carrierEventRequest(uspsEvent).expect(200);
    expect(await readShipmentUpdates(usps.shipmentId)).toHaveLength(2);
    expect(await readShipmentUpdates(dhl.shipmentId)).toHaveLength(2);
  });

  it('maps every carrier event without regressing later evidence', async () => {
    const seller = await createSeller('seller-carrier-mapping');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Carrier Mapping Parcel',
      sku: `MAP-${Date.now()}`,
      priceMinor: 1999,
      stock: 5,
    });

    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 1,
      status: 'paid',
    });
    await assignGroup({ order, shopId: seller.shopId });

    const trackingNumber = uspsTrackingNumber();
    const prepared = await prepareShipmentRequest(seller, order.orderPublicId, {
      carrier: 'usps',
      tracking_number: trackingNumber,
    }).expect(201);
    const shipmentId = (prepared.body.fulfillment as Fulfillment)
      .groups[0]!.shipments[0]!.id;

    // LABEL_CREATED confirms preparation and writes evidence even when the
    // status is unchanged.
    await carrierEventRequest(carrierEventBody({
      trackingNumber,
      eventCode: 'LABEL_CREATED',
      occurredAt: '2026-10-31T08:00:00.000Z',
      location: 'Austin, TX',
    })).expect(200);

    let shipment = (await getShopOrder(seller.agent, seller.shopId, order.orderPublicId))
      .order.fulfillment.groups[0]!.shipments[0]!;
    expect(shipment.status).toBe('prepared');
    expect(shipment.updates).toHaveLength(2);
    expect(shipment.updates.find((update) => update.event_code === 'LABEL_CREATED')).toMatchObject({
      status: 'prepared',
      event_code: 'LABEL_CREATED',
      location: 'Austin, TX',
    });

    // The wire code is case-insensitive.
    await carrierEventRequest(carrierEventBody({
      trackingNumber,
      eventCode: 'picked_up',
      occurredAt: '2026-10-31T08:10:00.000Z',
      location: 'Austin, TX',
    })).expect(200);

    shipment = (await getShopOrder(seller.agent, seller.shopId, order.orderPublicId))
      .order.fulfillment.groups[0]!.shipments[0]!;
    expect(shipment.status).toBe('dispatched');
    expect(shipment.dispatched_at).toBe('2026-10-31T08:10:00.000Z');

    // A label-created event arriving after pickup is stored but cannot regress it.
    await carrierEventRequest(carrierEventBody({
      trackingNumber,
      eventCode: 'LABEL_CREATED',
      occurredAt: '2026-10-31T08:05:00.000Z',
    })).expect(200);

    shipment = (await getShopOrder(seller.agent, seller.shopId, order.orderPublicId))
      .order.fulfillment.groups[0]!.shipments[0]!;
    expect(shipment.status).toBe('dispatched');
    expect(
      shipment.updates.filter((update) => update.event_code === 'LABEL_CREATED'),
    ).toHaveLength(2);

    await carrierEventRequest(carrierEventBody({
      trackingNumber,
      eventCode: 'IN_TRANSIT',
      occurredAt: '2026-10-31T09:00:00.000Z',
    })).expect(200);

    // OUT_FOR_DELIVERY maps onto the same journey step.
    await carrierEventRequest(carrierEventBody({
      trackingNumber,
      eventCode: 'OUT_FOR_DELIVERY',
      occurredAt: '2026-10-31T10:00:00.000Z',
      location: 'Portland, OR',
    })).expect(200);

    // Exceptions are stored as evidence without pretending the parcel moved.
    await carrierEventRequest(carrierEventBody({
      trackingNumber,
      eventCode: 'DELIVERY_FAILED',
      occurredAt: '2026-10-31T11:00:00.000Z',
      location: 'Portland, OR',
    })).expect(200);
    await carrierEventRequest(carrierEventBody({
      trackingNumber,
      eventCode: 'RETURNED',
      occurredAt: '2026-10-31T12:00:00.000Z',
      location: 'Austin, TX',
    })).expect(200);

    shipment = (await getShopOrder(seller.agent, seller.shopId, order.orderPublicId))
      .order.fulfillment.groups[0]!.shipments[0]!;
    expect(shipment.status).toBe('in_transit');
    expect(
      shipment.updates
        .filter((update) => update.actor_type === 'carrier')
        .map((update) => update.event_code)
        .sort(),
    ).toEqual([
      'DELIVERY_FAILED',
      'IN_TRANSIT',
      'LABEL_CREATED',
      'LABEL_CREATED',
      'OUT_FOR_DELIVERY',
      'PICKED_UP',
      'RETURNED',
    ]);

    const updates = await readShipmentUpdates(shipmentId);
    expect(updates.slice(-2).map((update) => ({
      status: update.status,
      eventCode: update.event_code,
      location: update.location,
    }))).toEqual([
      { status: 'in_transit', eventCode: 'DELIVERY_FAILED', location: 'Portland, OR' },
      { status: 'in_transit', eventCode: 'RETURNED', location: 'Austin, TX' },
    ]);

    const invalidCode = await carrierEventRequest(carrierEventBody({
      trackingNumber,
      eventCode: 'EXCEPTION',
      occurredAt: '2026-10-31T13:00:00.000Z',
    })).expect(400);
    expect(invalidCode.body.code).toBe('INVALID_CARRIER_EVENT');
    expect(await readShipmentUpdates(shipmentId)).toHaveLength(updates.length);
  });

  it('completes a fully delivered paid order from carrier delivery evidence', async () => {
    const seller = await createSeller('seller-carrier-delivery');
    const buyer = await createBuyer();
    const { productId, inventoryId } = await createProduct({
      seller,
      title: 'Carrier Delivery Parcel',
      sku: `DLV-${Date.now()}`,
      priceMinor: 1999,
      stock: 5,
    });

    const trackingNumber = uspsTrackingNumber();
    const order = await seedOrder({
      seller,
      buyer,
      productId,
      inventoryId,
      quantity: 2,
      status: 'paid',
      trackingNumber,
    });
    await assignGroup({ order, shopId: seller.shopId });

    await prepareShipmentRequest(seller, order.orderPublicId, {
      carrier: 'usps',
      tracking_number: trackingNumber,
    }).expect(201);

    await carrierEventRequest(carrierEventBody({
      trackingNumber,
      eventCode: 'PICKED_UP',
      occurredAt: '2026-10-31T08:00:00.000Z',
    })).expect(200);

    const deliveredEvent = carrierEventBody({
      trackingNumber,
      eventCode: 'DELIVERED',
      occurredAt: '2026-10-31T12:00:00.000Z',
      location: 'Portland, OR',
    });

    const deliveredResponse = await carrierEventRequest(deliveredEvent).expect(200);
    expect(deliveredResponse.body).toEqual({});

    const sellerView = await getShopOrder(seller.agent, seller.shopId, order.orderPublicId);
    const deliveredShipment = sellerView.order.fulfillment.groups[0]!.shipments[0]!;
    expect(deliveredShipment.status).toBe('delivered');
    expect(deliveredShipment.delivered_at).toBe('2026-10-31T12:00:00.000Z');
    expect(deliveredShipment.updates.find((update) => update.event_code === 'DELIVERED')).toMatchObject({
      status: 'delivered',
      actor_type: 'carrier',
      actor_id: 'usps',
      source: 'carrier',
      event_code: 'DELIVERED',
      location: 'Portland, OR',
    });

    // The existing delivery path is the one that runs: one durable delivered
    // outbox event, which drives Payout Availability without a second mechanism.
    const outbox = await sql.query<{ payload: Record<string, unknown> }>(
      `select "payload"
         from "outbox_events"
        where "event_name" = 'order.delivered' and "aggregate_id" = $1`,
      [order.orderId],
    );
    expect(outbox.rows).toHaveLength(1);
    expect(outbox.rows[0]!.payload).toMatchObject({
      orderId: order.orderId,
      deliveredAt: '2026-10-31T12:00:00.000Z',
    });

    // The Order's existing projection completes the fully delivered paid Order.
    await waitForOrderStatus(order.orderId, 'completed');

    // Buyer and guest views render the carrier's evidence.
    const buyerView = await buyer.agent
      .get(`${API_PREFIX}/me/orders/${order.orderPublicId}`)
      .expect(200);
    const buyerShipment = (buyerView.body.order_shop.fulfillment as Fulfillment)
      .groups[0]!.shipments[0]!;
    expect(buyerShipment.updates.find((update) => update.event_code === 'DELIVERED')).toMatchObject({
      event_code: 'DELIVERED',
      location: 'Portland, OR',
      actor_type: 'carrier',
    });

    const guestLookup = await request(app.getHttpServer())
      .get(`${API_PREFIX}/checkout/guest-orders`)
      .query({ email: buyer.email, order_id: order.orderPublicId, zip: '97201' })
      .expect(200);
    const guestShipment = guestLookup.body.order_shops[0].fulfillment.groups[0].shipments[0];
    expect(guestShipment.updates.find((update: { event_code?: string }) => update.event_code === 'DELIVERED')).toMatchObject({
      event_code: 'DELIVERED',
      location: 'Portland, OR',
    });

    // A repeated delivery event is acknowledged and publishes nothing new.
    await carrierEventRequest(deliveredEvent).expect(200);
    const outboxAfterReplay = await sql.query<{ count: number }>(
      `select count(*)::int as count
         from "outbox_events"
        where "event_name" = 'order.delivered' and "aggregate_id" = $1`,
      [order.orderId],
    );
    expect(outboxAfterReplay.rows[0]!.count).toBe(1);

    // A late transit event is stored but cannot rewrite the delivery.
    await carrierEventRequest(carrierEventBody({
      trackingNumber,
      eventCode: 'IN_TRANSIT',
      occurredAt: '2026-10-31T11:00:00.000Z',
      location: 'Portland, OR',
    })).expect(200);

    const lateShipment = (await getShopOrder(seller.agent, seller.shopId, order.orderPublicId))
      .order.fulfillment.groups[0]!.shipments[0]!;
    expect(lateShipment.status).toBe('delivered');
    expect(lateShipment.delivered_at).toBe('2026-10-31T12:00:00.000Z');
    expect(lateShipment.updates.find((update) => update.event_code === 'IN_TRANSIT')).toMatchObject({
      status: 'delivered',
      event_code: 'IN_TRANSIT',
      location: 'Portland, OR',
    });
    expect(lateShipment.updates.filter((update) => update.event_code === 'IN_TRANSIT')).toHaveLength(1);
  });

});
