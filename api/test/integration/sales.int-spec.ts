import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MongoClient } from 'mongodb';
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
import { Clock } from '~/platform/time/clock';
import { ObservabilityService } from '~/platform/observability/observability.service';
import { RequestContextService } from '~/platform/request-context/request-context.service';
import { createTestDatabase, dropTestDatabase } from '../support/test-postgres';
import { seedAuthReferenceData } from '../../database/seeds/auth.seed';
import { resolveShopId, seedPublishableInventory } from '../support/shipping-fixtures';

jest.setTimeout(240_000);

const API_PREFIX = '/v1';
const VALID_TEST_PASSWORD = 'Password123!';
const DAY_MS = 24 * 60 * 60 * 1000;
const TWO_DAYS_MS = 2 * DAY_MS;
const SIXTY_DAYS_MS = 60 * DAY_MS;

type TestDatabase = {
  dbName: string;
  rootConfig: {
    host: string; port: number; user: string; password: string;
  };
};

type TestSeller = {
  agent: Agent; email: string; shopId: string; shopPublicId: string 
};
type TestBuyer = {
  agent: Agent; email: string; userId: string; addressId: string;
};

type ShopSaleResponse = {
  id: string;
  shop: string;
  name: string;
  percent_off: number;
  product_scope: string;
  product_ids: string[];
  currency: string;
  start_at: string;
  end_at: string;
  timezone: string;
  status: string;
  cancelled_at?: string | null;
  ended_at?: string | null;
};

type QuoteResponse = {
  quote_id: string;
  subtotal_minor: number;
  total_minor: number;
  items?: Array<{
    inventory_id: string;
    unit_price_checkout_minor: number;
    line_total_checkout_minor: number;
  }>;
  shops: Array<{
    shop_id: string;
    subtotal_minor: number;
  }>;
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

function utcLocalDateTime(date: Date): string {
  return date.toISOString().slice(0, 16);
}

// eslint-disable-next-line max-lines-per-function
describe('Shop sales (integration)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: TestDatabase;
  let storageRoot: string;
  let sql: Client;
  let categoryId: string | undefined;
  let jobDispatcher: { dispatch: jest.Mock };

  /**
   * The instant every Sale lifecycle decision reads. Pinning it proves exact
   * Promotion Period boundaries without waiting for real time to pass.
   */
  let testNow: Date;

  function setTestNow(instant: Date) {
    testNow = instant;
  }

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testNow = new Date();
    jobDispatcher = { dispatch: jest.fn().mockResolvedValue(undefined) };
    testDb = await createTestDatabase('sales');
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-sales-int-'));

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
      .useValue(jobDispatcher)
      .overrideProvider(Clock)
      .useValue({ now: () => testNow })
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
        shop_name: `sale${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`,
        currency: 'USD',
      })
      .expect(201);

    return {
      agent, email, shopId: await resolveShopId(sql, shopResponse.body.id as string), shopPublicId: shopResponse.body.id as string,
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
        full_name: 'Buyer One',
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
      .send({ name: 'Sales', rank: 1 })
      .expect(201);

    categoryId = response.body.id as string;

    return categoryId;
  }

  async function createActiveProfile(seller: TestSeller): Promise<string> {
    const response = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/shipping-profiles`)
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

  async function createPublishedProduct(input: {
    seller: TestSeller;
    shippingProfileId: string;
    title: string;
    sku: string;
    amountMinor: number;
  }): Promise<{ productId: string; inventoryId: string }> {
    const productResponse = await input.seller.agent
      .post(`${API_PREFIX}/shops/${input.seller.shopPublicId}/products`)
      .set('Idempotency-Key', randomUUID())
      .send({
        category_id: await seedCategory(input.seller.agent),
        title: input.title,
        description: 'Sale product',
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
    const inventoryId = detail.body.inventory[0].id as string;

    await seedPublishableInventory(sql, {
      shopId: input.seller.shopPublicId,
      inventoryId,
      sku: input.sku,
      stock: 10,
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

    return { productId, inventoryId };
  }

  async function addCartItem(
    buyer: TestBuyer,
    inventoryId: string,
    quantity: number,
  ): Promise<void> {
    await buyer.agent
      .post(`${API_PREFIX}/cart/items`)
      .set('Idempotency-Key', randomUUID())
      .send({ inventory_id: inventoryId, quantity })
      .expect(201);
  }

  async function createQuote(buyer: TestBuyer): Promise<QuoteResponse> {
    const response = await buyer.agent
      .post(`${API_PREFIX}/me/checkout/quote`)
      .set('Idempotency-Key', randomUUID())
      .send({ user_address_id: buyer.addressId });

    expect(response.status).toBe(201);

    return response.body as QuoteResponse;
  }

  async function createSale(
    seller: TestSeller,
    body: Record<string, unknown>,
  ): Promise<ShopSaleResponse> {
    const response = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/sales`)
      .set('Idempotency-Key', randomUUID())
      .send(body)
      .expect(201);

    return response.body.sale as ShopSaleResponse;
  }

  async function listSales(seller: TestSeller): Promise<ShopSaleResponse[]> {
    const response = await seller.agent
      .get(`${API_PREFIX}/shops/${seller.shopPublicId}/sales`)
      .query({ limit: 100 })
      .expect(200);

    return response.body.results as ShopSaleResponse[];
  }

  function cancelSale(seller: TestSeller, saleId: string) {
    return seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/sales/${saleId}/cancel`)
      .set('Idempotency-Key', randomUUID());
  }

  function endSale(seller: TestSeller, saleId: string) {
    return seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/sales/${saleId}/end`)
      .set('Idempotency-Key', randomUUID());
  }

  function bulkStopSales(seller: TestSeller, ids: string[]) {
    return seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/sales/bulk-stop`)
      .set('Idempotency-Key', randomUUID())
      .send({ ids });
  }

  /**
   * Changes the regular price of an Inventory Item. This writes the same base
   * `variant_prices` row the seller price-edit path owns, so the next quote and
   * the next Sale projection both read the new regular price.
   */
  async function setRegularPriceMinor(
    inventoryId: string,
    amountMinor: number,
  ): Promise<void> {
    await sql.query(
      `update "variant_prices"
       set "amount_minor" = $2, "updated_at" = now()
       where "product_inventory_id" = $1 and "market_code" is null and "active_to" is null`,
      [inventoryId, amountMinor],
    );
  }

  function submitCashOrder(buyer: TestBuyer, quoteId: string) {
    return buyer.agent
      .post(`${API_PREFIX}/me/checkout`)
      .set('Idempotency-Key', randomUUID())
      .send({ quote_id: quoteId, payment_type: 'cash' });
  }

  it('rebuilds legacy Mongo public references during the public-id catalog cutover', async () => {
    const seller = await registerSeller('catalog-public-cutover');
    const profile = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Catalog cutover mug',
      sku: 'PUBLIC-CUTOVER-MUG',
      amountMinor: 2500,
    });
    const sale = await createSale(seller, {
      name: 'Catalog cutover Sale',
      percent_off: 20,
      product_scope: 'specific',
      product_ids: [product.productId],
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(Date.now() + TWO_DAYS_MS)),
    });
    const productRow = await sql.query<{ id: string }>(
      'select id from products where public_id = $1',
      [product.productId],
    );
    const internalProductId = productRow.rows[0]!.id;
    const promotionRow = await sql.query<{ id: string }>(
      'select id from promotions where public_id = $1',
      [sale.id],
    );
    const mongoDbName = `arc_public_cutover_${randomUUID().replace(/-/g, '')}`;
    const mongo = new MongoClient(process.env.CATALOG_MONGODB_URI ?? 'mongodb://127.0.0.1:27017');
    await mongo.connect();
    const db = mongo.db(mongoDbName);

    try {
      await Promise.all([
        db.collection('catalog_products').insertOne({
          productId: internalProductId,
          productPublicId: product.productId.slice(5),
          shopPublicId: seller.shopPublicId.slice(5),
        }),
        db.collection('catalog_product_search').insertOne({
          productId: internalProductId,
          productPublicId: product.productId.slice(5),
          shopPublicId: seller.shopPublicId.slice(5),
          price: { autoSale: { promotionId: promotionRow.rows[0]!.id, percentOff: 20 } },
        }),
        db.collection('catalog_product_prices').insertOne({
          productId: internalProductId,
          inventoryPricingById: {
            [product.inventoryId]: {
              basePrice: { autoSale: { promotionId: promotionRow.rows[0]!.id, percentOff: 20 } },
            },
          },
        }),
      ]);
      await promisify(execFile)(process.execPath, [
        '-r', 'ts-node/register', '-r', 'tsconfig-paths/register',
        'scripts/refresh-catalog-products.ts',
      ], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: '',
          CATALOG_SEARCH_DRIVER: 'mongo-basic',
          CATALOG_MONGODB_DB_NAME: mongoDbName,
          CATALOG_MONGODB_PRODUCTS_COLLECTION: 'catalog_products',
          CATALOG_MONGODB_PRICES_COLLECTION: 'catalog_product_prices',
          CATALOG_MONGODB_SLUGS_COLLECTION: 'catalog_product_slugs',
          CATALOG_MONGODB_SEARCH_COLLECTION: 'catalog_product_search',
        },
        maxBuffer: 8 * 1024 * 1024,
      });

      const document = await db.collection('catalog_products').findOne({ productId: internalProductId });
      const search = await db.collection('catalog_product_search').findOne({ productId: internalProductId });
      const prices = await db.collection('catalog_product_prices').findOne({ productId: internalProductId });
      expect(document).toMatchObject({
        productPublicId: product.productId,
        shopPublicId: seller.shopPublicId,
      });
      expect(search).toMatchObject({
        productPublicId: product.productId,
        shopPublicId: seller.shopPublicId,
        price: { autoSale: { promotionPublicId: sale.id, percentOff: 20 } },
      });
      expect(prices?.inventoryPricingById[product.inventoryId].basePrice.autoSale)
        .toEqual({ promotionPublicId: sale.id, percentOff: 20 });
      expect(JSON.stringify(search)).not.toContain('"promotionId"');
      expect(JSON.stringify(prices)).not.toContain('"promotionId"');
    }
    finally {
      await db.dropDatabase();
      await mongo.close();
    }
  });

  it('creates an active selected-product Sale and discounts only its targets at checkout', async () => {
    const seller = await registerSeller('sale-active');
    const profile = await createActiveProfile(seller);
    const targeted = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Targeted Mug',
      sku: 'SALE-TARGET-1',
      amountMinor: 2500,
    });
    const untargeted = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Untargeted Mug',
      sku: 'SALE-OTHER-1',
      amountMinor: 3000,
    });

    const createResponse = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/sales`)
      .set('Idempotency-Key', randomUUID())
      .send({
        name: 'Autumn Sale',
        percent_off: 25,
        product_scope: 'specific',
        product_ids: [targeted.productId],
        timezone: 'UTC',
        start_now: true,
        end_local: utcLocalDateTime(new Date(Date.now() + TWO_DAYS_MS)),
      })
      .expect(201);

    const sale = createResponse.body.sale as ShopSaleResponse;
    expect(sale.status).toBe('active');
    expect(sale.percent_off).toBe(25);
    expect(sale.product_ids).toEqual([targeted.productId]);
    expect(sale.currency).toBe('USD');

    const listResponse = await seller.agent
      .get(`${API_PREFIX}/shops/${seller.shopPublicId}/sales`)
      .expect(200);
    expect(listResponse.body.total_results).toBe(1);
    expect(listResponse.body.results[0].name).toBe('Autumn Sale');

    const buyer = await registerBuyer('sale-active');
    await addCartItem(buyer, targeted.inventoryId, 2);
    await addCartItem(buyer, untargeted.inventoryId, 1);

    const quote = await createQuote(buyer);
    // 2 x (2500 - 25%) + 3000 = 3750 + 3000; the untargeted product is untouched.
    expect(quote.subtotal_minor).toBe(6750);

    const orderResponse = await buyer.agent
      .post(`${API_PREFIX}/me/checkout`)
      .set('Idempotency-Key', randomUUID())
      .send({ quote_id: quote.quote_id, payment_type: 'cash' })
      .expect(201);

    const orderId = orderResponse.body.order_shops[0].id as string;
    const orderRow = await sql.query(
      'select "id", "subtotal_minor", "total_minor" from "orders" where "public_id" = $1',
      [orderId],
    );
    expect(orderRow.rows[0].subtotal_minor).toBe(6750);

    const items = await sql.query(
      'select "unit_price_minor" from "order_items" where "order_id" = $1 order by "unit_price_minor"',
      [orderRow.rows[0].id],
    );
    expect(items.rows).toEqual([
      { unit_price_minor: 1875 },
      { unit_price_minor: 3000 },
    ]);
  });

  it('rejects duplicate and foreign-shop product targets', async () => {
    const seller = await registerSeller('sale-scope');
    const profile = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Scope Mug',
      sku: 'SALE-SCOPE-1',
      amountMinor: 2000,
    });
    const otherSeller = await registerSeller('sale-foreign');
    const otherProfile = await createActiveProfile(otherSeller);
    const foreignProduct = await createPublishedProduct({
      seller: otherSeller,
      shippingProfileId: otherProfile,
      title: 'Foreign Mug',
      sku: 'SALE-FOREIGN-1',
      amountMinor: 2000,
    });

    const endLocal = utcLocalDateTime(new Date(Date.now() + TWO_DAYS_MS));

    await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/sales`)
      .set('Idempotency-Key', randomUUID())
      .send({
        name: 'Duplicate targets',
        percent_off: 10,
        product_scope: 'specific',
        product_ids: [product.productId, product.productId],
        timezone: 'UTC',
        start_now: true,
        end_local: endLocal,
      })
      .expect(400);

    await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/sales`)
      .set('Idempotency-Key', randomUUID())
      .send({
        name: 'Foreign target',
        percent_off: 10,
        product_scope: 'specific',
        product_ids: [foreignProduct.productId],
        timezone: 'UTC',
        start_now: true,
        end_local: endLocal,
      })
      .expect(400);
  });

  it('validates the schedule: end after start, no 30-day cap, and no daylight-saving gaps or unreconciled repeats', async () => {
    const seller = await registerSeller('sale-schedule');
    const endpoint = `${API_PREFIX}/shops/${seller.shopPublicId}/sales`;
    const endLocal = utcLocalDateTime(new Date(Date.now() + SIXTY_DAYS_MS));

    // A schedule longer than 30 days is allowed.
    await seller.agent
      .post(endpoint)
      .set('Idempotency-Key', randomUUID())
      .send({
        name: 'Long sale',
        percent_off: 15,
        product_scope: 'all',
        timezone: 'UTC',
        start_now: true,
        end_local: endLocal,
      })
      .expect(201);

    await seller.agent
      .post(endpoint)
      .set('Idempotency-Key', randomUUID())
      .send({
        name: 'Reversed',
        percent_off: 15,
        product_scope: 'all',
        timezone: 'UTC',
        start_local: '2026-12-01T10:00',
        end_local: '2026-12-01T09:00',
      })
      .expect(400);

    // 02:30 on the spring-forward day does not exist in America/New_York.
    await seller.agent
      .post(endpoint)
      .set('Idempotency-Key', randomUUID())
      .send({
        name: 'Nonexistent local time',
        percent_off: 15,
        product_scope: 'all',
        timezone: 'America/New_York',
        start_local: '2026-03-08T02:30',
        end_local: '2026-03-10T10:00',
      })
      .expect(400);

    // 01:30 on the fall-back day occurs twice and needs explicit disambiguation.
    await seller.agent
      .post(endpoint)
      .set('Idempotency-Key', randomUUID())
      .send({
        name: 'Ambiguous local time',
        percent_off: 15,
        product_scope: 'all',
        timezone: 'America/New_York',
        start_local: '2026-11-01T01:30',
        end_local: '2026-11-02T10:00',
      })
      .expect(400);

    const disambiguated = await seller.agent
      .post(endpoint)
      .set('Idempotency-Key', randomUUID())
      .send({
        name: 'Disambiguated local time',
        percent_off: 15,
        product_scope: 'all',
        timezone: 'America/New_York',
        start_local: '2026-11-01T01:30',
        start_offset_minutes: -240,
        end_local: '2026-11-02T10:00',
      })
      .expect(201);

    expect((disambiguated.body.sale as ShopSaleResponse).start_at)
      .toBe('2026-11-01T05:30:00.000Z');
    expect((disambiguated.body.sale as ShopSaleResponse).status).toBe('scheduled');
    expect((disambiguated.body.sale as ShopSaleResponse).timezone)
      .toBe('America/New_York');
  });

  it('takes the highest matching active Sale percentage and never compounds overlaps', async () => {
    const seller = await registerSeller('sale-overlap');
    const profile = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Overlap Mug',
      sku: 'SALE-OVERLAP-1',
      amountMinor: 10000,
    });
    const endLocal = utcLocalDateTime(new Date(Date.now() + TWO_DAYS_MS));

    const twenty = await createSale(seller, {
      name: 'Twenty off',
      percent_off: 20,
      product_scope: 'all',
      timezone: 'UTC',
      start_now: true,
      end_local: endLocal,
    });
    const thirty = await createSale(seller, {
      name: 'Thirty off',
      percent_off: 30,
      product_scope: 'all',
      timezone: 'UTC',
      start_now: true,
      end_local: endLocal,
    });

    const buyer = await registerBuyer('sale-overlap');
    await addCartItem(buyer, product.inventoryId, 1);

    // 100.00 x (1 - 30%) = 70.00. Compounding would have produced 56.00.
    expect((await createQuote(buyer)).subtotal_minor).toBe(7000);

    // Stopping the winning Sale leaves the other eligible Sale in force.
    await endSale(seller, thirty.id).expect(201);
    expect((await createQuote(buyer)).subtotal_minor).toBe(8000);

    await endSale(seller, twenty.id).expect(201);
    expect((await createQuote(buyer)).subtotal_minor).toBe(10000);
  });

  it('includes a Product published after an all-Products Sale was created', async () => {
    const seller = await registerSeller('sale-future');
    const profile = await createActiveProfile(seller);

    await createSale(seller, {
      name: 'Everything off',
      percent_off: 10,
      product_scope: 'all',
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(Date.now() + TWO_DAYS_MS)),
    });

    const later = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Published After',
      sku: 'SALE-FUTURE-1',
      amountMinor: 5000,
    });

    const buyer = await registerBuyer('sale-future');
    await addCartItem(buyer, later.inventoryId, 2);

    expect((await createQuote(buyer)).subtotal_minor).toBe(9000);
  });

  it('recomputes a Sale from the new regular price after a price change', async () => {
    const seller = await registerSeller('sale-reprice');
    const profile = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Reprice Mug',
      sku: 'SALE-REPRICE-1',
      amountMinor: 10000,
    });

    await createSale(seller, {
      name: 'Reprice twenty',
      percent_off: 20,
      product_scope: 'all',
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(Date.now() + TWO_DAYS_MS)),
    });

    const buyer = await registerBuyer('sale-reprice');
    await addCartItem(buyer, product.inventoryId, 1);
    expect((await createQuote(buyer)).subtotal_minor).toBe(8000);

    await setRegularPriceMinor(product.inventoryId, 12000);

    // 120.00 x (1 - 20%) = 96.00: the Sale tracks the current regular price
    // instead of a frozen creation-time base.
    expect((await createQuote(buyer)).subtotal_minor).toBe(9600);
  });

  it('activates inclusively at its start instant and stops exclusively at its end instant', async () => {
    const seller = await registerSeller('sale-boundary');
    const profile = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Boundary Mug',
      sku: 'SALE-BOUNDARY-1',
      amountMinor: 10000,
    });
    const buyer = await registerBuyer('sale-boundary');
    await addCartItem(buyer, product.inventoryId, 1);

    setTestNow(new Date('2026-06-01T09:59:59.999Z'));

    const sale = await createSale(seller, {
      name: 'Boundary Sale',
      percent_off: 25,
      product_scope: 'all',
      timezone: 'UTC',
      start_local: '2026-06-01T10:00',
      end_local: '2026-06-01T11:00',
    });

    expect(sale.start_at).toBe('2026-06-01T10:00:00.000Z');
    expect(sale.end_at).toBe('2026-06-01T11:00:00.000Z');
    expect(sale.status).toBe('scheduled');
    expect((await createQuote(buyer)).subtotal_minor).toBe(10000);

    // One millisecond before the start: still not applied.
    setTestNow(new Date('2026-06-01T09:59:59.999Z'));
    expect((await listSales(seller))[0]?.status).toBe('scheduled');

    // Exactly at the start instant: the start is inclusive.
    setTestNow(new Date('2026-06-01T10:00:00.000Z'));
    expect((await listSales(seller))[0]?.status).toBe('active');
    expect((await createQuote(buyer)).subtotal_minor).toBe(7500);

    // One millisecond before the end: still applied.
    setTestNow(new Date('2026-06-01T10:59:59.999Z'));
    expect((await createQuote(buyer)).subtotal_minor).toBe(7500);

    // Exactly at the end instant: the end is exclusive.
    setTestNow(new Date('2026-06-01T11:00:00.000Z'));
    expect((await listSales(seller))[0]?.status).toBe('ended');
    expect((await createQuote(buyer)).subtotal_minor).toBe(10000);
  });

  it('cancels scheduled Sales and ends active Sales individually and in bulk without removing them', async () => {
    setTestNow(new Date('2026-07-01T00:00:00.000Z'));

    const seller = await registerSeller('sale-stop');
    const profile = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Stop Mug',
      sku: 'SALE-STOP-1',
      amountMinor: 10000,
    });
    const buyer = await registerBuyer('sale-stop');
    await addCartItem(buyer, product.inventoryId, 1);

    const scheduled = await createSale(seller, {
      name: 'Scheduled stop',
      percent_off: 10,
      product_scope: 'all',
      timezone: 'UTC',
      start_local: '2026-07-02T10:00',
      end_local: '2026-07-02T11:00',
    });
    const active = await createSale(seller, {
      name: 'Active stop',
      percent_off: 20,
      product_scope: 'all',
      timezone: 'UTC',
      start_local: '2026-06-01T00:00',
      end_local: '2026-07-30T00:00',
    });

    expect(scheduled.status).toBe('scheduled');
    expect(active.status).toBe('active');
    expect((await createQuote(buyer)).subtotal_minor).toBe(8000);

    const cancelled = await cancelSale(seller, scheduled.id).expect(201);
    expect((cancelled.body.sale as ShopSaleResponse).status).toBe('cancelled');
    expect((cancelled.body.sale as ShopSaleResponse).cancelled_at).not.toBeNull();

    const ended = await endSale(seller, active.id).expect(201);
    expect((ended.body.sale as ShopSaleResponse).status).toBe('ended');
    expect((ended.body.sale as ShopSaleResponse).ended_at).not.toBeNull();

    // The stop is irreversible and the selling price is back to regular.
    await cancelSale(seller, scheduled.id).expect(409);
    await endSale(seller, active.id).expect(409);
    expect((await createQuote(buyer)).subtotal_minor).toBe(10000);

    // State rules are the same for the individual and the bulk action.
    const scheduledTwo = await createSale(seller, {
      name: 'Scheduled two',
      percent_off: 15,
      product_scope: 'all',
      timezone: 'UTC',
      start_local: '2026-07-03T10:00',
      end_local: '2026-07-03T11:00',
    });
    const activeTwo = await createSale(seller, {
      name: 'Active two',
      percent_off: 25,
      product_scope: 'all',
      timezone: 'UTC',
      start_local: '2026-06-01T00:00',
      end_local: '2026-07-29T00:00',
    });
    await endSale(seller, scheduledTwo.id).expect(409);
    await cancelSale(seller, activeTwo.id).expect(409);

    const missingId = 'prm_000000000000';
    const bulk = await bulkStopSales(seller, [
      scheduledTwo.id,
      activeTwo.id,
      scheduled.id,
      missingId,
    ]).expect(201);

    expect(bulk.body.succeeded_ids).toEqual([scheduledTwo.id, activeTwo.id]);
    expect(bulk.body.failed).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: scheduled.id, code: 'NOT_STOPPABLE' }),
      expect.objectContaining({ id: missingId, code: 'NOT_FOUND' }),
    ]));
    expect((await createQuote(buyer)).subtotal_minor).toBe(10000);

    // Every stopped Sale keeps its definition, scope and schedule.
    const sales = await listSales(seller);
    const stoppedIds = [scheduled.id, active.id, scheduledTwo.id, activeTwo.id];

    expect(sales.map((entry) => entry.id).sort())
      .toEqual(expect.arrayContaining(stoppedIds));
    expect(sales.find((entry) => entry.id === scheduled.id)).toMatchObject({
      name: 'Scheduled stop',
      percent_off: 10,
      product_scope: 'all',
      start_at: '2026-07-02T10:00:00.000Z',
      end_at: '2026-07-02T11:00:00.000Z',
      status: 'cancelled',
    });
    expect(sales.find((entry) => entry.id === activeTwo.id)).toMatchObject({
      name: 'Active two',
      status: 'ended',
    });

  });

  it('keeps committed Order prices after a Sale stops and the regular price changes', async () => {
    const seller = await registerSeller('sale-frozen');
    const profile = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Frozen Mug',
      sku: 'SALE-FROZEN-1',
      amountMinor: 10000,
    });

    const sale = await createSale(seller, {
      name: 'Frozen twenty',
      percent_off: 20,
      product_scope: 'all',
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(Date.now() + TWO_DAYS_MS)),
    });

    const buyer = await registerBuyer('sale-frozen');
    await addCartItem(buyer, product.inventoryId, 2);

    const quote = await createQuote(buyer);
    expect(quote.subtotal_minor).toBe(16000);

    const orderResponse = await submitCashOrder(buyer, quote.quote_id).expect(201);
    const orderId = orderResponse.body.order_shops[0].id as string;

    await endSale(seller, sale.id).expect(201);
    await setRegularPriceMinor(product.inventoryId, 15000);

    const order = await sql.query(
      'select "subtotal_minor", "discount_minor" from "orders" where "public_id" = $1',
      [orderId],
    );
    expect(order.rows[0]).toEqual({ subtotal_minor: 16000, discount_minor: 0 });

    const items = await sql.query(
      'select oi."unit_price_minor", oi."line_total_minor" from "order_items" oi join "orders" o on oi."order_id" = o."id" where o."public_id" = $1',
      [orderId],
    );
    expect(items.rows).toEqual([{ unit_price_minor: 8000, line_total_minor: 16000 }]);
  });

  it('refuses a stale accepted quote and requires the refreshed totals to be accepted', async () => {
    const seller = await registerSeller('sale-stale');
    const profile = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Stale Mug',
      sku: 'SALE-STALE-1',
      amountMinor: 10000,
    });

    const sale = await createSale(seller, {
      name: 'Stale twenty-five',
      percent_off: 25,
      product_scope: 'all',
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(Date.now() + TWO_DAYS_MS)),
    });

    const buyer = await registerBuyer('sale-stale');
    await addCartItem(buyer, product.inventoryId, 1);

    const accepted = await createQuote(buyer);
    expect(accepted.subtotal_minor).toBe(7500);

    await endSale(seller, sale.id).expect(201);

    const rejected = await submitCashOrder(buyer, accepted.quote_id).expect(409);
    expect(rejected.body.code).toBe('CHECKOUT_QUOTE_PRICES_CHANGED');
    expect(rejected.body.details.refreshed_totals).toMatchObject({
      checkout_currency: 'USD',
      subtotal_minor: 10000,
      discount_minor: 0,
    });

    const ordersAfterRejection = await sql.query(
      'select count(*)::int as count from "orders" where "user_id" = $1',
      [buyer.userId],
    );
    expect(ordersAfterRejection.rows[0].count).toBe(0);

    // Accepting the refreshed totals is an explicit new quote, and that quote
    // commits at the price the buyer saw.
    const refreshed = await createQuote(buyer);
    expect(refreshed.subtotal_minor).toBe(10000);

    const orderResponse = await submitCashOrder(buyer, refreshed.quote_id).expect(201);
    const orderId = orderResponse.body.order_shops[0].id as string;
    const items = await sql.query(
      'select oi."unit_price_minor" from "order_items" oi join "orders" o on oi."order_id" = o."id" where o."public_id" = $1',
      [orderId],
    );
    expect(items.rows).toEqual([{ unit_price_minor: 10000 }]);
  });

  it('prices the cart line with the active Sale and agrees with the accepted quote', async () => {
    const seller = await registerSeller('sale-cart-line');
    const shippingProfileId = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId,
      title: 'Cart line product',
      sku: 'CART-LINE-1',
      amountMinor: 1500,
    });

    await createSale(seller, {
      name: 'Cart line sale',
      percent_off: 60,
      product_scope: 'all',
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(Date.now() + TWO_DAYS_MS)),
    });

    const buyer = await registerBuyer('sale-cart-line');
    await addCartItem(buyer, product.inventoryId, 1);

    const cartResponse = await buyer.agent
      .get(`${API_PREFIX}/cart`)
      .expect(200);
    const line = cartResponse.body.cart.shop_groups[0].items[0];

    // The line shows what the buyer is actually charged, plus the regular price
    // it was reduced from.
    expect(line.inventory).toMatchObject({
      amount_minor: 600,
      original_amount_minor: 1500,
      currency: 'USD',
    });

    const quote = await createQuote(buyer);

    // The line, the per-item quote and the order the buyer accepts cannot
    // disagree about the merchandise.
    expect(quote.subtotal_minor).toBe(600);
    expect(quote.subtotal_minor).toBe(line.inventory.amount_minor * line.quantity);
    expect(quote.items).toEqual([
      expect.objectContaining({
        inventory_id: product.inventoryId,
        unit_price_checkout_minor: 600,
        line_total_checkout_minor: 600,
      }),
    ]);
  });

  it('rounds the cart line and the accepted quote identically at a half-cent boundary', async () => {
    const seller = await registerSeller('sale-cart-rounding');
    const shippingProfileId = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId,
      title: 'Rounding product',
      sku: 'CART-ROUND-1',
      amountMinor: 1050,
    });

    await createSale(seller, {
      name: 'Rounding sale',
      percent_off: 5,
      product_scope: 'all',
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(Date.now() + TWO_DAYS_MS)),
    });

    const buyer = await registerBuyer('sale-cart-rounding');
    await addCartItem(buyer, product.inventoryId, 1);

    const cartResponse = await buyer.agent
      .get(`${API_PREFIX}/cart`)
      .expect(200);
    const line = cartResponse.body.cart.shop_groups[0].items[0];

    // $10.50 less 5% is 997.5 minor units, and half-up is 998. Multiplying
    // major units as a float first would round down to 997 and charge a
    // different amount from the one the line shows.
    expect(line.inventory).toMatchObject({
      amount_minor: 998,
      original_amount_minor: 1050,
    });

    const quote = await createQuote(buyer);

    expect(quote.subtotal_minor).toBe(998);
    expect(quote.items).toEqual([
      expect.objectContaining({
        inventory_id: product.inventoryId,
        unit_price_checkout_minor: 998,
      }),
    ]);
  });

  describe('store timezone settings', () => {
    function updateShopSettings(seller: TestSeller, timezone: unknown) {
      return seller.agent
        .patch(`${API_PREFIX}/shops/${seller.shopPublicId}/settings`)
        .set('Idempotency-Key', randomUUID())
        .send({ timezone });
    }

    async function getMyShop(seller: TestSeller): Promise<{ id: string; timezone: string }> {
      const response = await seller.agent
        .get(`${API_PREFIX}/shops/me`)
        .expect(200);

      return response.body as { id: string; timezone: string };
    }

    it('starts at UTC and persists the store timezone the seller chooses', async () => {
      const seller = await registerSeller('store-tz');

      expect((await getMyShop(seller)).timezone).toBe('UTC');

      const updated = await updateShopSettings(seller, 'Asia/Saigon').expect(200);
      expect(updated.body).toMatchObject({ id: seller.shopPublicId, timezone: 'Asia/Saigon' });

      expect((await getMyShop(seller)).timezone).toBe('Asia/Saigon');
    });

    it('rejects a timezone that is not an IANA zone and keeps the stored one', async () => {
      const seller = await registerSeller('store-tz-bad');
      await updateShopSettings(seller, 'Asia/Saigon').expect(200);

      await updateShopSettings(seller, 'Not/AZone').expect(400);

      expect((await getMyShop(seller)).timezone).toBe('Asia/Saigon');
    });

    it('refuses a seller who does not own the shop', async () => {
      const owner = await registerSeller('store-tz-owner');
      const intruder = await registerSeller('store-tz-intruder');

      await intruder.agent
        .patch(`${API_PREFIX}/shops/${owner.shopPublicId}/settings`)
        .set('Idempotency-Key', randomUUID())
        .send({ timezone: 'Asia/Saigon' })
        .expect(403);

      expect((await getMyShop(owner)).timezone).toBe('UTC');
      expect((await getMyShop(intruder)).timezone).toBe('UTC');
    });

    it('leaves an existing sale schedule untouched when the store timezone changes', async () => {
      const seller = await registerSeller('store-tz-sale');
      await updateShopSettings(seller, 'Asia/Saigon').expect(200);

      const sale = await createSale(seller, {
        name: 'Timezone preserved',
        percent_off: 20,
        product_scope: 'all',
        timezone: 'Asia/Saigon',
        start_local: '2026-12-01T09:00',
        end_local: '2026-12-31T21:00',
      });

      await updateShopSettings(seller, 'America/New_York').expect(200);

      const [listed] = await listSales(seller);
      expect(listed.id).toBe(sale.id);
      expect(listed.timezone).toBe('Asia/Saigon');
      expect(listed.start_at).toBe(sale.start_at);
      expect(listed.end_at).toBe(sale.end_at);

      // The store default moved; the already scheduled Sale did not.
      expect((await getMyShop(seller)).timezone).toBe('America/New_York');
    });
  });
});
