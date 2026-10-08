import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
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
import { RequestLoggingInterceptor } from '~/platform/interceptors/request-logging.interceptor';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import { ProductWhoMade } from '~/domains/product/domain/enums/product-who-made.enum';
import { FulfillmentService } from '~/domains/fulfillment/app/services/fulfillment.service';
import { ShipmentUpdateActorType } from '~/domains/fulfillment/domain/enums/shipment-update-actor-type.enum';
import { ShipmentUpdateSource } from '~/domains/fulfillment/domain/enums/shipment-update-source.enum';
import { PermissionEntity } from '~/domains/auth/infra/persistence/entities/permission.entity';
import { RolePermissionEntity } from '~/domains/auth/infra/persistence/entities/role-permission.entity';
import { RoleEntity } from '~/domains/auth/infra/persistence/entities/role.entity';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
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
  tracking_number?: string;
  shipment_note?: string;
  prepared_at: string;
  dispatched_at?: string;
  delivered_at?: string;
  voided_at?: string;
  items: ShipmentItem[];
  updates: Array<{
    status: string; actor_type: string; source: string; occurred_at: string 
  }>;
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
  return `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
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
      .compile();

    app = moduleFixture.createNestApplication();
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    app.enableShutdownHooks();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
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
        phone: '+15550000001',
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

  function journeyRequest(
    seller: TestSeller,
    orderPublicId: string,
    shipmentId: string,
    status: string,
  ) {
    return seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${orderPublicId}/fulfillment/shipments/${shipmentId}/journey`)
      .set('Idempotency-Key', randomUUID())
      .send({ status });
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

  it('prepares, dispatches, transits and delivers a confirmed order through public APIs', async () => {
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

    const prepareResponse = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments`)
      .set('Idempotency-Key', randomUUID())
      .send({ carrier: 'USPS', tracking_number: 'TRACK-1', shipment_note: 'Front desk' })
      .expect(201);

    const preparedShipment = (prepareResponse.body.fulfillment as Fulfillment)
      .groups[0]!.shipments[0]!;
    expect(preparedShipment.status).toBe('prepared');
    expect(preparedShipment.carrier).toBe('USPS');
    expect(preparedShipment.tracking_number).toBe('TRACK-1');
    expect(preparedShipment.dispatched_at ?? null).toBeNull();
    expect(preparedShipment.items).toEqual([
      { order_item_id: order.orderItemId, quantity: 2 },
    ]);
    expect(prepareResponse.body.fulfillment.status).toBe('prepared');
    // Preparation does not alter the cash Order's commercial payment state.
    expect((await getShopOrder(seller.agent, seller.shopPublicId, order.orderPublicId)).order.status)
      .toBe('pending');

    const dispatchResponse = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments/${preparedShipment.id}/journey`)
      .set('Idempotency-Key', randomUUID())
      .send({ status: 'dispatched' })
      .expect(201);
    expect(dispatchResponse.body.fulfillment.status).toBe('shipped');

    const dispatchedShipment = dispatchResponse.body.fulfillment.groups[0].shipments[0];
    expect(dispatchedShipment.status).toBe('dispatched');
    expect(dispatchedShipment.dispatched_at).toEqual(expect.any(String));

    // Replay of the same status does not duplicate updates or reset timestamps.
    const replayResponse = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments/${preparedShipment.id}/journey`)
      .set('Idempotency-Key', randomUUID())
      .send({ status: 'dispatched' })
      .expect(201);
    expect(replayResponse.body.fulfillment.groups[0].shipments[0].updates).toHaveLength(
      Number(dispatchedShipment.updates.length),
    );
    expect(replayResponse.body.fulfillment.groups[0].shipments[0].dispatched_at)
      .toBe(dispatchedShipment.dispatched_at);

    await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments/${preparedShipment.id}/journey`)
      .set('Idempotency-Key', randomUUID())
      .send({ status: 'in_transit' })
      .expect(201);

    const deliveredResponse = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments/${preparedShipment.id}/journey`)
      .set('Idempotency-Key', randomUUID())
      .send({ status: 'delivered' })
      .expect(201);
    expect(deliveredResponse.body.fulfillment.status).toBe('delivered');
    expect(deliveredResponse.body.fulfillment.progress).toMatchObject({
      ordered: 2,
      dispatched: 2,
      delivered: 2,
      outstanding: 0,
    });

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
      tracking_number: 'TRACK-1',
    });

    // Authorized guest tracking sees the same collection.
    const guestLookup = await request(app.getHttpServer())
      .get(`${API_PREFIX}/checkout/guest-orders`)
      .query({ email: buyer.email, order_id: order.orderPublicId, zip: '97201' })
      .expect(200);
    const guestOrder = guestLookup.body.order_shops[0];
    expect(guestOrder.fulfillment.status).toBe('delivered');
    expect(guestOrder.fulfillment.groups[0].shipments[0].tracking_number).toBe('TRACK-1');

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
      .send({ carrier: 'DHL' })
      .expect(403);

    const shipmentsAfterCrossShop = await sql.query(
      'select count(*)::int as count from "shipments" where "order_id" = $1',
      [order.orderId],
    );
    expect(shipmentsAfterCrossShop.rows[0].count).toBe(1);
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
      .send({ carrier: 'USPS' })
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
      .send({ carrier: 'USPS' })
      .expect(201);
    expect(afterReconcile.body.fulfillment.groups[0].shipments[0].items).toHaveLength(1);
    expect(afterReconcile.body.fulfillment.groups[0].shipments[0].items[0].quantity).toBe(3);

    // Reconciliation did not consume stock again.
    expect(await readInventoryStock(inventoryId)).toBe(4);
  });

  it('rejects delivering straight out of preparation and releases voided preparation', async () => {
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

    const invalidTransition = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments/${shipmentId}/journey`)
      .set('Idempotency-Key', randomUUID())
      .send({ status: 'delivered' })
      .expect(409);
    expect(invalidTransition.body.code).toBe('INVALID_SHIPMENT_JOURNEY_TRANSITION');

    const amended = await seller.agent
      .patch(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments/${shipmentId}`)
      .set('Idempotency-Key', randomUUID())
      .send({ tracking_number: 'TRACK-EDIT' })
      .expect(200);
    expect(amended.body.fulfillment.groups[0].shipments[0].tracking_number).toBe('TRACK-EDIT');

    const voided = await seller.agent
      .delete(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${order.orderPublicId}/fulfillment/shipments/${shipmentId}`)
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    expect(voided.body.fulfillment.groups[0].shipments[0].status).toBe('voided');
    expect(voided.body.fulfillment.progress.prepared).toBe(0);

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

    const first = await prepareShipmentRequest(seller, order.orderPublicId, {
      items: [{ order_item_id: order.orderItemId, quantity: 1 }],
      carrier: 'USPS',
      tracking_number: 'PARCEL-1',
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
      carrier: 'DHL',
      tracking_number: 'PARCEL-2',
    }).expect(201);
    const secondShipment = (second.body.fulfillment as Fulfillment).groups[0]!.shipments[1]!;
    expect((second.body.fulfillment as Fulfillment).groups[0]!.shipments).toHaveLength(2);
    expect((second.body.fulfillment as Fulfillment).progress).toMatchObject({
      ordered: 3,
      prepared: 3,
      outstanding: 3,
    });

    await journeyRequest(seller, order.orderPublicId, firstShipment.id, 'dispatched').expect(201);
    await journeyRequest(seller, order.orderPublicId, firstShipment.id, 'delivered').expect(201);

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

    await journeyRequest(seller, order.orderPublicId, secondShipment.id, 'dispatched').expect(201);
    await journeyRequest(seller, order.orderPublicId, secondShipment.id, 'delivered').expect(201);

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
    }).expect(201);
    const shipmentId = (prepared.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!.id;
    expect((prepared.body.fulfillment as Fulfillment).progress).toMatchObject({
      ordered: 3,
      prepared: 2,
    });

    await journeyRequest(seller, order.orderPublicId, shipmentId, 'dispatched').expect(201);
    await journeyRequest(seller, order.orderPublicId, shipmentId, 'delivered').expect(201);

    const partial = await getShopOrder(seller.agent, seller.shopPublicId, order.orderPublicId);
    expect(partial.order.status).toBe('paid');
    expect(partial.order.fulfillment.progress).toMatchObject({
      ordered: 3,
      delivered: 2,
      outstanding: 1,
    });

    const remainder = await prepareShipmentRequest(seller, order.orderPublicId, {
      items: [{ order_item_id: order.items[0]!.orderItemId, quantity: 1 }],
    }).expect(201);
    expect((remainder.body.fulfillment as Fulfillment).groups[0]!.items).toEqual([
      { order_item_id: order.items[0]!.orderItemId, quantity: 2 },
      { order_item_id: order.items[1]!.orderItemId, quantity: 1 },
    ]);

    const remainderShipmentId = (remainder.body.fulfillment as Fulfillment)
      .groups[0]!.shipments[1]!.id;
    await journeyRequest(seller, order.orderPublicId, remainderShipmentId, 'dispatched').expect(201);
    await journeyRequest(seller, order.orderPublicId, remainderShipmentId, 'delivered').expect(201);

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
      carrier: 'USPS',
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

    const prepared = await prepareShipmentRequest(seller, order.orderPublicId, {}).expect(201);
    const shipmentId = (prepared.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!.id;

    const [dispatchResult, cancelResult] = await Promise.all([
      journeyRequest(seller, order.orderPublicId, shipmentId, 'dispatched'),
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
      carrier: 'USPS',
      tracking_number: 'LABEL-ONLY',
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
    }).expect(201);
    const shipmentId = (prepared.body.fulfillment as Fulfillment).groups[0]!.shipments[0]!.id;
    await journeyRequest(seller, order.orderPublicId, shipmentId, 'dispatched').expect(201);

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
});
