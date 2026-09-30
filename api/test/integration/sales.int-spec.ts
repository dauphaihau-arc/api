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
import { RequestLoggingInterceptor } from '~/platform/interceptors/request-logging.interceptor';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import { ProductWhoMade } from '~/domains/product/domain/enums/product-who-made.enum';
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
import { seedPublishableInventory } from '../support/shipping-fixtures';

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

type TestSeller = { agent: Agent; email: string; shopId: string };
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
};

type QuoteResponse = {
  quote_id: string;
  subtotal_minor: number;
  total_minor: number;
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

  beforeAll(async () => {
    originalEnv = { ...process.env };
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

    return { agent, email, shopId: shopResponse.body.id as string };
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
      .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
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
      .post(`${API_PREFIX}/shops/${input.seller.shopId}/products`)
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

    await input.seller.agent
      .put(`${API_PREFIX}/shops/${input.seller.shopId}/products/${productId}/images`)
      .attach('images', Buffer.from(`image-${productId}`), {
        filename: `${productId}.jpg`,
        contentType: 'image/jpeg',
      })
      .expect(204);

    const detail = await input.seller.agent
      .get(`${API_PREFIX}/shops/${input.seller.shopId}/products/${productId}`)
      .expect(200);
    const inventoryId = detail.body.inventory[0].id as string;

    await seedPublishableInventory(sql, {
      shopId: input.seller.shopId,
      inventoryId,
      sku: input.sku,
      stock: 10,
      amountMinor: input.amountMinor,
    });

    await input.seller.agent
      .put(`${API_PREFIX}/shops/${input.seller.shopId}/products/${productId}/shipping-profile`)
      .set('Idempotency-Key', randomUUID())
      .send({ shipping_profile_id: input.shippingProfileId })
      .expect(204);

    await input.seller.agent
      .post(`${API_PREFIX}/shops/${input.seller.shopId}/products/${productId}/publish`)
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
      .post(`${API_PREFIX}/shops/${seller.shopId}/sales`)
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
      .get(`${API_PREFIX}/shops/${seller.shopId}/sales`)
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
      'select "subtotal_minor", "total_minor" from "orders" where "id" = $1',
      [orderId],
    );
    expect(orderRow.rows[0].subtotal_minor).toBe(6750);

    const items = await sql.query(
      'select "unit_price_minor" from "order_items" where "order_id" = $1 order by "unit_price_minor"',
      [orderId],
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
      .post(`${API_PREFIX}/shops/${seller.shopId}/sales`)
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
      .post(`${API_PREFIX}/shops/${seller.shopId}/sales`)
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
    const endpoint = `${API_PREFIX}/shops/${seller.shopId}/sales`;
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
});
