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
import { ObservabilityService } from '~/platform/observability/observability.service';
import { RequestContextService } from '~/platform/request-context/request-context.service';
import { createTestDatabase, dropTestDatabase } from '../support/test-postgres';
import { seedAuthReferenceData } from '../../database/seeds/auth.seed';
import { resolveProductId, seedPublishableInventory } from '../support/shipping-fixtures';

jest.setTimeout(240_000);

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

type ShippingQuoteResponse = {
  quote_id: string;
  checkout_currency: string;
  subtotal_minor: number;
  shipping_minor: number;
  discount_minor: number;
  total_minor: number;
  shipping_anchor_at?: string;
  items: Array<{ checkout_currency: string }>;
  shops: Array<{
    shop_id: string;
    subtotal_minor: number;
    shipping_minor: number;
    shipping_discount_minor: number;
    shipping_discounts: Array<Record<string, unknown>>;
    total_minor: number;
    shipping: {
      shop_id: string;
      currency: string;
      charge: { currency: string; total_minor: number; quantity: number };
      estimate: {
        combined_min_days: number;
        combined_max_days: number;
        latest_delivery_date: string;
      };
      units: Array<Record<string, unknown>>;
    };
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

// eslint-disable-next-line max-lines-per-function
describe('Order accepted shipping facts (integration)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: TestDatabase;
  let storageRoot: string;
  let sql: Client;
  let categoryId: string | undefined;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase('order_shipping_quote');
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-order-shipping-int-'));

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
        shop_name: `ord${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`,
        currency: 'USD',
      })
      .expect(201);

    return {
      agent, email, shopId: shopResponse.body.id as string, shopPublicId: shopResponse.body.id as string, 
    };
  }

  async function registerBuyer(
    prefix: string,
    addressOverrides: Partial<{
      fullName: string;
      city: string;
      state: string;
      zip: string;
      country: string;
    }> = {},
  ): Promise<TestBuyer> {
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
        full_name: addressOverrides.fullName ?? 'Buyer One',
        address_1: '123 Main St',
        city: addressOverrides.city ?? 'Los Angeles',
        state: addressOverrides.state ?? 'CA',
        zip: addressOverrides.zip ?? '90001',
        country: addressOverrides.country ?? 'US',
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
      .send({ name: 'Order shipping', rank: 1 })
      .expect(201);

    categoryId = response.body.id as string;

    return categoryId;
  }

  async function createActiveProfile(
    seller: TestSeller,
    overrides: {
      oneItemFeeMinor?: number;
      additionalItemFeeMinor?: number;
      processingTimeMinDays?: number;
      processingTimeMaxDays?: number;
      destinationCountry?: string;
    } = {},
  ): Promise<{ id: string; version: number }> {
    const response = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/shipping-profiles`)
      .set('Idempotency-Key', randomUUID())
      .send({
        name: `Standard ${Date.now().toString().slice(-6)}`,
        status: 'active',
        ship_from_country: 'US',
        ship_from_postal: '10001',
        processing_time_min_days: overrides.processingTimeMinDays ?? 1,
        processing_time_max_days: overrides.processingTimeMaxDays ?? 3,
        rates: [
          {
            destination_scope: 'country',
            destination_country: overrides.destinationCountry ?? 'US',
            one_item_fee_minor: overrides.oneItemFeeMinor ?? 599,
            additional_item_fee_minor: overrides.additionalItemFeeMinor ?? 199,
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
    stock?: number;
  }): Promise<{ productId: string; inventoryId: string }> {
    const productResponse = await input.seller.agent
      .post(`${API_PREFIX}/shops/${input.seller.shopPublicId}/products`)
      .set('Idempotency-Key', randomUUID())
      .send({
        category_id: await seedCategory(input.seller.agent),
        title: input.title,
        description: 'Order shipping product',
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
      shopId: input.seller.shopId,
      inventoryId,
      sku: input.sku,
      stock: input.stock ?? 10,
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

  /**
   * A physical Product that reached `active` without a Shipping Profile — the
   * legacy/misconfigured shape the publish gate normally prevents. It is
   * activated directly so checkout shipping can be exercised against it.
   */
  async function createActivePhysicalProductWithoutProfile(
    seller: TestSeller,
  ): Promise<{ productId: string; inventoryId: string }> {
    const productResponse = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/products`)
      .set('Idempotency-Key', randomUUID())
      .send({
        category_id: await seedCategory(seller.agent),
        title: 'Unassigned Physical',
        description: 'Physical product without a shipping profile',
        who_made: ProductWhoMade.I_DID,
        is_digital: false,
      })
      .expect(201);
    const productId = productResponse.body.id as string;
    const productPublicId = productResponse.body.id as string;

    const detail = await seller.agent
      .get(`${API_PREFIX}/shops/${seller.shopPublicId}/products/${productPublicId}`)
      .expect(200);
    const inventoryId = detail.body.inventory[0].id as string;

    await seedPublishableInventory(sql, {
      shopId: seller.shopId,
      inventoryId,
      sku: 'NO-PROFILE-1',
      stock: 5,
      amountMinor: 2500,
    });

    await sql.query(
      'update "products" set "state" = \'active\', "published_at" = now() where "public_id" = $1',
      [productPublicId],
    );

    return { productId, inventoryId };
  }

  async function createPublishedProduct(input: {
    seller: TestSeller;
    title: string;
    sku: string;
    amountMinor: number;
    stock?: number;
    isDigital?: boolean;
    shippingProfileId?: string;
  }): Promise<{ productId: string; inventoryId: string }> {
    const productResponse = await input.seller.agent
      .post(`${API_PREFIX}/shops/${input.seller.shopPublicId}/products`)
      .set('Idempotency-Key', randomUUID())
      .send({
        category_id: await seedCategory(input.seller.agent),
        title: input.title,
        description: 'Order shipping product',
        who_made: ProductWhoMade.I_DID,
        is_digital: input.isDigital ?? false,
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
      shopId: input.seller.shopId,
      inventoryId,
      sku: input.sku,
      stock: input.stock ?? 10,
      amountMinor: input.amountMinor,
    });

    if (input.shippingProfileId) {
      await input.seller.agent
        .put(`${API_PREFIX}/shops/${input.seller.shopPublicId}/products/${productPublicId}/shipping-profile`)
        .set('Idempotency-Key', randomUUID())
        .send({ shipping_profile_id: input.shippingProfileId })
        .expect(204);
    }

    await input.seller.agent
      .post(`${API_PREFIX}/shops/${input.seller.shopPublicId}/products/${productPublicId}/publish`)
      .set('Idempotency-Key', randomUUID())
      .expect(201);

    return { productId, inventoryId };
  }

  /**
   * The canonical FX seam reads live rates from `exchange_rates`; integration
   * tests seed the pair they exercise.
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
   * The buyer's saved market preference is authoritative over request headers,
   * so a Vietnam/VND buyer is set up through the public profile endpoint.
   */
  async function setBuyerMarket(
    buyer: TestBuyer,
    preferences: { region: string, language: string, currency: string },
  ): Promise<void> {
    await buyer.agent
      .patch(`${API_PREFIX}/me`)
      .set('Idempotency-Key', randomUUID())
      .send({ preferences })
      .expect(200);
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

  async function createQuote(
    buyer: TestBuyer,
    options: {
      promoCode?: string;
      shopId?: string;
    } = {},
  ): Promise<ShippingQuoteResponse> {
    const response = await buyer.agent
      .post(`${API_PREFIX}/me/checkout/quote`)
      .set('Idempotency-Key', randomUUID())
      .send({
        user_address_id: buyer.addressId,
        ...(options.promoCode && options.shopId
          ? {
            addition_info_shop_carts: [
              {
                shop_id: options.shopId,
                promo_codes: [options.promoCode],
              },
            ],
          }
          : {}),
      });

    expect(response.body).toMatchObject({
      quote_id: expect.any(String),
      checkout_currency: expect.any(String),
      total_minor: expect.any(Number),
      shops: expect.any(Array),
    });

    return response.body as ShippingQuoteResponse;
  }

  async function confirmOrder(
    buyer: TestBuyer,
    quoteId: string,
    paymentType: 'cash' | 'card',
  ) {
    return buyer.agent
      .post(`${API_PREFIX}/me/checkout`)
      .set('Idempotency-Key', randomUUID())
      .send({ quote_id: quoteId, payment_type: paymentType });
  }

  async function readOrderRow(orderPublicId: string) {
    const result = await sql.query(
      `select "id", "subtotal_minor", "shipping_minor", "discount_minor", "total_minor",
              "shipping_estimated_delivery", "shipping_quote_snapshot", "promo_codes"
       from "orders" where "public_id" = $1`,
      [orderPublicId],
    );

    return result.rows[0];
  }

  it('persists the accepted quote shipping charge and estimate on a cash order', async () => {
    const seller = await registerSeller('ord-cash');
    const profile = await createActiveProfile(seller);
    const product = await createPublishableProduct({
      seller,
      shippingProfileId: profile.id,
      title: 'Cash Mug',
      sku: 'CASH-1',
      amountMinor: 2500,
    });
    const buyer = await registerBuyer('ord-cash');
    await addCartItem(buyer, product.inventoryId, 2);

    const quote = await createQuote(buyer);
    const quoteShop = quote.shops[0]!;
    expect(quoteShop.shipping.charge.total_minor).toBe(798);
    expect(quote.shipping_minor).toBe(798);
    expect(quote.total_minor).toBe(quoteShop.subtotal_minor + 798);

    const orderResponse = await confirmOrder(buyer, quote.quote_id, 'cash');
    expect(orderResponse.status).toBe(201);
    const orderShop = orderResponse.body.order_shops[0] as { id: string };
    const orderId = orderShop.id;
    const orderPublicId = orderShop.id;

    const orderRow = await readOrderRow(orderId);
    expect(orderRow.shipping_minor).toBe(798);
    expect(orderRow.total_minor).toBe(quote.total_minor);
    expect(orderRow.shipping_quote_snapshot.shipping.charge.total_minor).toBe(798);
    expect(orderRow.shipping_quote_snapshot.shipping.estimate.combined_min_days).toBe(4);
    expect(orderRow.shipping_quote_snapshot.shipping.estimate.combined_max_days).toBe(8);
    expect(
      new Date(orderRow.shipping_estimated_delivery).toISOString(),
    ).toBe(quoteShop.shipping.estimate.latest_delivery_date);

    const detail = await buyer.agent
      .get(`${API_PREFIX}/me/orders/${orderPublicId}`)
      .expect(200);

    expect(detail.body.order_shop.shipping_minor).toBe(798);
    expect(detail.body.order_shop.shipping).toEqual(quoteShop.shipping);
    expect(detail.body.order_shop.shipping_discount_minor).toBe(0);
    expect(detail.body.order_shop.shipping_discounts).toEqual([]);
  });

  it('charges a country rate configured as a code for a buyer address holding the country name', async () => {
    const seller = await registerSeller('ord-au');
    const profile = await createActiveProfile(seller, {
      destinationCountry: 'AU',
      oneItemFeeMinor: 900,
      additionalItemFeeMinor: 400,
    });
    const product = await createPublishableProduct({
      seller,
      shippingProfileId: profile.id,
      title: 'Australia Print',
      sku: 'AU-1',
      amountMinor: 3000,
    });
    const buyer = await registerBuyer('ord-au', {
      fullName: 'Australia Buyer',
      city: 'Melbourne',
      state: 'VIC',
      zip: '3000',
      country: 'Australia',
    });
    await addCartItem(buyer, product.inventoryId, 2);

    const quote = await createQuote(buyer);
    const quoteShop = quote.shops[0]!;

    expect(quoteShop.shipping.charge.total_minor).toBe(1300);
    expect(quote.shipping_minor).toBe(1300);

    const orderResponse = await confirmOrder(buyer, quote.quote_id, 'cash');
    expect(orderResponse.status).toBe(201);

    const orderRow = await readOrderRow(orderResponse.body.order_shops[0].id as string);
    expect(orderRow.shipping_minor).toBe(1300);
  });

  it('charges each shop independently for a multi-shop checkout', async () => {
    const firstSeller = await registerSeller('ord-multi-a');
    const secondSeller = await registerSeller('ord-multi-b');
    const firstProfile = await createActiveProfile(firstSeller, { oneItemFeeMinor: 599 });
    const secondProfile = await createActiveProfile(secondSeller, { oneItemFeeMinor: 1200 });
    const firstProduct = await createPublishableProduct({
      seller: firstSeller,
      shippingProfileId: firstProfile.id,
      title: 'Multi A',
      sku: 'MULTI-A',
      amountMinor: 2000,
    });
    const secondProduct = await createPublishableProduct({
      seller: secondSeller,
      shippingProfileId: secondProfile.id,
      title: 'Multi B',
      sku: 'MULTI-B',
      amountMinor: 3000,
    });
    const buyer = await registerBuyer('ord-multi');
    await addCartItem(buyer, firstProduct.inventoryId, 1);
    await addCartItem(buyer, secondProduct.inventoryId, 1);

    const quote = await createQuote(buyer);
    expect(quote.shops).toHaveLength(2);
    const charges = quote.shops
      .map((shop) => shop.shipping.charge.total_minor)
      .sort((left, right) => left - right);
    expect(charges).toEqual([599, 1200]);
    expect(quote.shipping_minor).toBe(1799);

    const orderResponse = await confirmOrder(buyer, quote.quote_id, 'cash');
    expect(orderResponse.status).toBe(201);
    expect(orderResponse.body.order_shops).toHaveLength(2);

    const rows = await Promise.all(
      (orderResponse.body.order_shops as Array<{ id: string }>).map((order) => readOrderRow(order.id)),
    );
    const persistedCharges = rows
      .map((row) => row.shipping_minor)
      .sort((left, right) => left - right);
    expect(persistedCharges).toEqual([599, 1200]);
    expect(rows.reduce((total, row) => total + row.total_minor, 0)).toBe(quote.total_minor);
  });

  it('waives the shipping charge once for an eligible free-shipping Promo Code', async () => {
    const seller = await registerSeller('ord-promo');
    const profile = await createActiveProfile(seller, { oneItemFeeMinor: 900 });
    const product = await createPublishableProduct({
      seller,
      shippingProfileId: profile.id,
      title: 'Promo Mug',
      sku: 'PROMO-1',
      amountMinor: 2500,
    });

    const code = `FREE${Date.now().toString().slice(-6)}`;
    await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/promo-codes`)
      .set('Idempotency-Key', randomUUID())
      .send({
        name: 'Free shipping',
        code,
        benefit_type: 'free_shipping',
        product_scope: 'all',
        start_local: new Date(Date.now() - 86_400_000).toISOString().slice(0, 16),
        end_local: new Date(Date.now() + 86_400_000).toISOString().slice(0, 16),
        timezone: 'UTC',
        max_redemptions: 100,
        max_redemptions_per_buyer: 5,
        min_order_type: 'none',
      })
      .expect(201);

    const buyer = await registerBuyer('ord-promo');
    await addCartItem(buyer, product.inventoryId, 1);

    const quote = await createQuote(buyer, { promoCode: code, shopId: seller.shopId });
    const quoteShop = quote.shops[0]!;

    expect(quoteShop.shipping.charge.total_minor).toBe(900);
    expect(quoteShop.shipping_minor).toBe(0);
    expect(quoteShop.shipping_discount_minor).toBe(900);
    expect(quoteShop.shipping_discounts).toEqual([
      expect.objectContaining({ code, waived_minor: 900, benefit_type: 'free_shipping' }),
    ]);
    expect(quote.discount_minor).toBe(0);
    expect(quote.shipping_minor).toBe(0);

    const orderResponse = await confirmOrder(buyer, quote.quote_id, 'cash');
    const orderShop = orderResponse.body.order_shops[0] as { id: string };
    const orderId = orderShop.id;
    const orderRow = await readOrderRow(orderId);

    expect(orderRow.shipping_minor).toBe(0);
    expect(orderRow.total_minor).toBe(quote.total_minor);
    expect(orderRow.promo_codes).toEqual([code]);
    expect(orderRow.shipping_quote_snapshot.shipping_discount_minor).toBe(900);
    expect(orderRow.shipping_quote_snapshot.shipping.charge.total_minor).toBe(900);

    const usages = await sql.query(
      'select count(*)::int as "count" from "promotion_usages" where "order_id" = $1 and "code" = $2',
      [orderRow.id, code],
    );
    expect(usages.rows[0].count).toBe(1);
  });

  it('does not rewrite the accepted charge or estimate when the profile changes later', async () => {
    const seller = await registerSeller('ord-edit');
    const profile = await createActiveProfile(seller, { oneItemFeeMinor: 700 });
    const product = await createPublishableProduct({
      seller,
      shippingProfileId: profile.id,
      title: 'Edit Mug',
      sku: 'EDIT-1',
      amountMinor: 2500,
    });
    const buyer = await registerBuyer('ord-edit');
    await addCartItem(buyer, product.inventoryId, 1);

    const quote = await createQuote(buyer);
    const orderResponse = await confirmOrder(buyer, quote.quote_id, 'cash');
    const orderShop = orderResponse.body.order_shops[0] as { id: string };
    const orderId = orderShop.id;
    const orderPublicId = orderShop.id;
    const before = await readOrderRow(orderId);

    await seller.agent
      .patch(`${API_PREFIX}/shops/${seller.shopPublicId}/shipping-profiles/${profile.id}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        version: profile.version,
        name: `Edited ${Date.now().toString().slice(-6)}`,
        status: 'active',
        processing_time_min_days: 5,
        processing_time_max_days: 9,
        rates: [
          {
            destination_scope: 'country',
            destination_country: 'US',
            one_item_fee_minor: 2500,
            additional_item_fee_minor: 500,
            delivery_time_min_days: 7,
            delivery_time_max_days: 12,
          },
        ],
      })
      .expect(200);

    const after = await readOrderRow(orderId);
    expect(after.shipping_minor).toBe(before.shipping_minor);
    expect(after.total_minor).toBe(before.total_minor);
    expect(after.shipping_quote_snapshot).toEqual(before.shipping_quote_snapshot);
    expect(new Date(after.shipping_estimated_delivery).toISOString())
      .toBe(new Date(before.shipping_estimated_delivery).toISOString());

    const detail = await buyer.agent
      .get(`${API_PREFIX}/me/orders/${orderPublicId}`)
      .expect(200);
    expect(detail.body.order_shop.shipping).toEqual(quote.shops[0]!.shipping);
  });

  it('refuses confirmation once the quoted assignment is no longer deliverable', async () => {
    const seller = await registerSeller('ord-mutate');
    const profile = await createActiveProfile(seller);
    const product = await createPublishableProduct({
      seller,
      shippingProfileId: profile.id,
      title: 'Mutate Mug',
      sku: 'MUTATE-1',
      amountMinor: 2500,
    });
    const buyer = await registerBuyer('ord-mutate');
    await addCartItem(buyer, product.inventoryId, 1);

    const quote = await createQuote(buyer);

    // An active profile can only be reassigned or degraded within its own
    // readiness rules, so the quoted Product is made undeliverable by replacing
    // the destination coverage with a country the buyer is not in.
    await seller.agent
      .patch(`${API_PREFIX}/shops/${seller.shopPublicId}/shipping-profiles/${profile.id}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        version: profile.version,
        name: `Mutated ${Date.now().toString().slice(-6)}`,
        status: 'active',
        processing_time_min_days: 1,
        processing_time_max_days: 3,
        rates: [
          {
            destination_scope: 'country',
            destination_country: 'JP',
            one_item_fee_minor: 599,
            additional_item_fee_minor: 199,
            delivery_time_min_days: 3,
            delivery_time_max_days: 5,
          },
        ],
      })
      .expect(200);

    const response = await confirmOrder(buyer, quote.quote_id, 'cash');
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('CHECKOUT_SHIPPING_UNAVAILABLE');
    expect(response.body.details.products).toEqual([
      expect.objectContaining({
        product_id: product.productId,
        reason: 'unsupported_destination',
      }),
    ]);

    const orders = await sql.query(
      'select count(*)::int as "count" from "orders" where "payment_details"->>\'quote_id\' = $1',
      [quote.quote_id],
    );
    expect(orders.rows[0].count).toBe(0);
  });

  it('rejects an unsupported destination at quote time without falling back', async () => {
    const seller = await registerSeller('ord-unsupported');
    const profile = await createActiveProfile(seller);
    const product = await createPublishableProduct({
      seller,
      shippingProfileId: profile.id,
      title: 'Unsupported Mug',
      sku: 'UNSUPPORTED-1',
      amountMinor: 2500,
    });
    const buyer = await registerBuyer('ord-unsupported');

    await buyer.agent
      .patch(`${API_PREFIX}/me/addresses/${buyer.addressId}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        country: 'DE', state: 'BE', city: 'Berlin', zip: '10115', 
      })
      .expect(200);

    await addCartItem(buyer, product.inventoryId, 1);

    const response = await buyer.agent
      .post(`${API_PREFIX}/me/checkout/quote`)
      .set('Idempotency-Key', randomUUID())
      .send({ user_address_id: buyer.addressId });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('CHECKOUT_SHIPPING_UNAVAILABLE');
    expect(response.body.details.products).toEqual([
      expect.objectContaining({ product_id: product.productId, reason: 'unsupported_destination' }),
    ]);
  });

  it('scopes a quote to its owner and refuses an expired quote', async () => {
    const seller = await registerSeller('ord-owner');
    const profile = await createActiveProfile(seller);
    const product = await createPublishableProduct({
      seller,
      shippingProfileId: profile.id,
      title: 'Owner Mug',
      sku: 'OWNER-1',
      amountMinor: 2500,
    });
    const owner = await registerBuyer('ord-owner');
    const intruder = await registerBuyer('ord-intruder');
    await addCartItem(owner, product.inventoryId, 1);

    const quote = await createQuote(owner);

    const intruderResponse = await confirmOrder(intruder, quote.quote_id, 'cash');
    expect(intruderResponse.status).toBe(404);

    await sql.query(
      'update "checkout_quotes" set "expires_at" = now() - interval \'1 hour\' where "id" = $1',
      [quote.quote_id],
    );

    const expiredResponse = await confirmOrder(owner, quote.quote_id, 'cash');
    expect(expiredResponse.status).toBe(400);
    expect(expiredResponse.body.code).toBe('CHECKOUT_QUOTE_EXPIRED');
  });

  it('maps a real order the caller cannot see through the order filter to a coded 404', async () => {
    const seller = await registerSeller('ord-cross');
    const profile = await createActiveProfile(seller);
    const product = await createPublishableProduct({
      seller,
      shippingProfileId: profile.id,
      title: 'Cross Mug',
      sku: 'CROSS-1',
      amountMinor: 2500,
    });
    const owner = await registerBuyer('ord-cross-owner');
    const intruder = await registerBuyer('ord-cross-intruder');
    await addCartItem(owner, product.inventoryId, 1);

    const quote = await createQuote(owner);
    const orderResponse = await confirmOrder(owner, quote.quote_id, 'cash');
    expect(orderResponse.status).toBe(201);
    const orderShops = orderResponse.body.order_shops as Array<{ id: string }>;
    const orderPublicId = orderShops[0]!.id;

    // The order exists; the intruder is simply not its buyer, so the use case
    // throws the order domain's OrderNotFoundError after the public-id lookup.
    const response = await intruder.agent
      .get(`${API_PREFIX}/me/orders/${orderPublicId}`)
      .expect(404);

    expect(response.body.code).toBe('ORDER_NOT_FOUND');
  });

  it('charges the card provider the persisted order money and never a reprice', async () => {
    const seller = await registerSeller('ord-card');
    const profile = await createActiveProfile(seller, { oneItemFeeMinor: 900 });
    const product = await createPublishableProduct({
      seller,
      shippingProfileId: profile.id,
      title: 'Card Mug',
      sku: 'CARD-1',
      amountMinor: 2500,
    });
    const buyer = await registerBuyer('ord-card');
    await addCartItem(buyer, product.inventoryId, 2);

    const quote = await createQuote(buyer);
    const orderResponse = await confirmOrder(buyer, quote.quote_id, 'card');
    expect(orderResponse.status).toBe(201);
    const orderId = orderResponse.body.order_shops[0].id as string;

    const orderRow = await readOrderRow(orderId);
    const outbox = await sql.query(
      `select "payload" from "outbox_events"
       where "event_name" = 'order.checkout-session-requested'
       order by "created_at" desc limit 1`,
    );
    const payload = outbox.rows[0].payload as {
      lineItems: Array<{ unitAmountMinor: number; quantity: number }>;
      shippingAmountMinor: number;
      discountAmountMinor: number;
      orderIds: string[];
    };

    expect(payload.orderIds).toContain(orderRow.id);
    expect(payload.shippingAmountMinor).toBe(orderRow.shipping_minor);
    expect(payload.discountAmountMinor).toBe(orderRow.discount_minor);
    expect(
      payload.lineItems.reduce(
        (total, item) => total + (item.unitAmountMinor * item.quantity),
        0,
      ) + payload.shippingAmountMinor - payload.discountAmountMinor,
    ).toBe(orderRow.total_minor);
  });

  it('never adds a charge or rewrites the estimate when a shipment is split', async () => {
    const seller = await registerSeller('ord-shipment');
    const profile = await createActiveProfile(seller, { oneItemFeeMinor: 800 });
    const product = await createPublishableProduct({
      seller,
      shippingProfileId: profile.id,
      title: 'Shipment Mug',
      sku: 'SHIPMENT-1',
      amountMinor: 2500,
      stock: 10,
    });
    const buyer = await registerBuyer('ord-shipment');
    await addCartItem(buyer, product.inventoryId, 3);

    const quote = await createQuote(buyer);
    const orderResponse = await confirmOrder(buyer, quote.quote_id, 'cash');
    const orderShop = orderResponse.body.order_shops[0] as { id: string };
    const orderId = orderShop.id;
    const orderPublicId = orderShop.id;
    const before = await readOrderRow(orderId);

    const detail = await seller.agent
      .get(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${orderPublicId}`)
      .expect(200);
    const orderItemId = detail.body.order.products[0].id as string;

    await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${orderPublicId}/fulfillment/shipments`)
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ order_item_id: orderItemId, quantity: 1 }],
        carrier: 'Test Carrier',
        tracking_number: 'TRACK-1',
      })
      .expect(201);

    await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${orderPublicId}/fulfillment/shipments`)
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ order_item_id: orderItemId, quantity: 2 }],
        carrier: 'Test Carrier',
        tracking_number: 'TRACK-2',
      })
      .expect(201);

    const after = await readOrderRow(orderId);
    expect(after.shipping_minor).toBe(before.shipping_minor);
    expect(after.total_minor).toBe(before.total_minor);
    expect(after.shipping_quote_snapshot).toEqual(before.shipping_quote_snapshot);
    expect(new Date(after.shipping_estimated_delivery).toISOString())
      .toBe(new Date(before.shipping_estimated_delivery).toISOString());

    const orderDetail = await seller.agent
      .get(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${orderPublicId}`)
      .expect(200);
    expect(orderDetail.body.order.shipping_minor).toBe(before.shipping_minor);
    expect(orderDetail.body.order.shipping).toEqual(quote.shops[0]!.shipping);
  });

  it('quotes and confirms a digital-only cart with no Shipping Charge or estimate', async () => {
    const seller = await registerSeller('ord-digital');
    const digital = await createPublishedProduct({
      seller,
      title: 'Digital Asset',
      sku: 'DIGITAL-1',
      amountMinor: 1500,
      isDigital: true,
    });
    const buyer = await registerBuyer('ord-digital');
    await addCartItem(buyer, digital.inventoryId, 2);

    const quote = await createQuote(buyer);
    const quoteShop = quote.shops[0]!;

    expect(quote.shipping_minor).toBe(0);
    expect(quoteShop.shipping_minor).toBe(0);
    expect(quoteShop.shipping).toBeUndefined();
    expect(quoteShop.shipping_discount_minor).toBe(0);
    expect(quoteShop.shipping_discounts).toEqual([]);
    expect(quote.total_minor).toBe(quoteShop.subtotal_minor);

    const orderResponse = await confirmOrder(buyer, quote.quote_id, 'cash');
    expect(orderResponse.status).toBe(201);
    const orderShop = orderResponse.body.order_shops[0] as { id: string };
    const orderId = orderShop.id;
    const orderPublicId = orderShop.id;

    const orderRow = await readOrderRow(orderId);
    expect(orderRow.shipping_minor).toBe(0);
    expect(orderRow.total_minor).toBe(quote.total_minor);
    expect(orderRow.shipping_quote_snapshot).toBeNull();
    expect(orderRow.shipping_estimated_delivery).toBeNull();

    const detail = await buyer.agent
      .get(`${API_PREFIX}/me/orders/${orderPublicId}`)
      .expect(200);

    expect(detail.body.order_shop.shipping_minor).toBe(0);
    expect(detail.body.order_shop.shipping).toBeUndefined();
  });

  it('prices and estimates only the physical units of a mixed cart', async () => {
    const seller = await registerSeller('ord-mixed');
    const profile = await createActiveProfile(seller, { oneItemFeeMinor: 900 });
    const physical = await createPublishedProduct({
      seller,
      title: 'Mixed Physical',
      sku: 'MIXED-PHYSICAL',
      amountMinor: 2500,
      shippingProfileId: profile.id,
    });
    const digital = await createPublishedProduct({
      seller,
      title: 'Mixed Digital',
      sku: 'MIXED-DIGITAL',
      amountMinor: 1200,
      isDigital: true,
    });
    const buyer = await registerBuyer('ord-mixed');
    await addCartItem(buyer, physical.inventoryId, 1);
    await addCartItem(buyer, digital.inventoryId, 3);

    const quote = await createQuote(buyer);
    const quoteShop = quote.shops[0]!;

    expect(quote.shipping_minor).toBe(900);
    expect(quoteShop.shipping.charge.quantity).toBe(1);
    expect(quoteShop.shipping.charge.total_minor).toBe(900);
    expect(quoteShop.shipping.units).toEqual([
      expect.objectContaining({ product_id: physical.productId, quantity: 1 }),
    ]);
    expect(quote.total_minor).toBe(quoteShop.subtotal_minor + 900);

    const orderResponse = await confirmOrder(buyer, quote.quote_id, 'cash');
    expect(orderResponse.status).toBe(201);
    const orderRow = await readOrderRow(orderResponse.body.order_shops[0].id as string);

    expect(orderRow.shipping_minor).toBe(900);
    expect(orderRow.total_minor).toBe(quote.total_minor);
    expect(orderRow.shipping_quote_snapshot.shipping.charge.quantity).toBe(1);
    expect(orderRow.shipping_quote_snapshot.shipping.units).toEqual([
      expect.objectContaining({ product_id: await resolveProductId(sql, physical.productId), quantity: 1 }),
    ]);
  });

  it('keeps a physical Product without a ready profile actionable next to a digital Product', async () => {
    const seller = await registerSeller('ord-no-profile');
    const unassigned = await createActivePhysicalProductWithoutProfile(seller);
    const digital = await createPublishedProduct({
      seller,
      title: 'No Profile Digital',
      sku: 'NO-PROFILE-DIGITAL',
      amountMinor: 1200,
      isDigital: true,
    });
    const buyer = await registerBuyer('ord-no-profile');
    await addCartItem(buyer, unassigned.inventoryId, 1);
    await addCartItem(buyer, digital.inventoryId, 1);

    const response = await buyer.agent
      .post(`${API_PREFIX}/me/checkout/quote`)
      .set('Idempotency-Key', randomUUID())
      .send({ user_address_id: buyer.addressId });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('CHECKOUT_SHIPPING_UNAVAILABLE');
    expect(response.body.details.products).toEqual([
      expect.objectContaining({
        product_id: unassigned.productId,
        reason: 'missing_assignment',
      }),
    ]);
  });

  it('converts seller-currency shipping into the checkout currency end to end', async () => {
    await seedExchangeRate('USD', 'VND', '25400');
    const seller = await registerSeller('ord-fx');
    const profile = await createActiveProfile(seller, {
      oneItemFeeMinor: 599,
      additionalItemFeeMinor: 250,
    });
    const product = await createPublishableProduct({
      seller,
      shippingProfileId: profile.id,
      title: 'FX Mug',
      sku: 'FX-1',
      amountMinor: 2500,
    });
    const buyer = await registerBuyer('ord-fx');
    await setBuyerMarket(buyer, { region: 'Vietnam', language: 'la', currency: 'VND' });
    await addCartItem(buyer, product.inventoryId, 2);

    const quote = await createQuote(buyer);
    const quoteShop = quote.shops[0]!;

    // The whole review is one checkout currency: merchandise and shipping.
    expect(quote.checkout_currency).toBe('VND');
    expect(quote.items[0]?.checkout_currency).toBe('VND');
    expect(quoteShop.shipping.currency).toBe('VND');
    expect(quoteShop.shipping.charge.currency).toBe('VND');

    // 599 USD cents = $5.99 at 25400 VND/USD, plus one 250-cent additional unit.
    expect(quoteShop.shipping.charge.total_minor).toBe(215646);
    expect(quoteShop.shipping_minor).toBe(215646);
    expect(quote.shipping_minor).toBe(215646);
    expect(quote.shops.reduce((total, shop) => total + shop.shipping_minor, 0))
      .toBe(quote.shipping_minor);
    expect(quote.total_minor).toBe(quoteShop.subtotal_minor + quote.shipping_minor);

    const [unit] = quoteShop.shipping.units;
    expect(unit).toEqual(expect.objectContaining({
      currency: 'VND',
      one_item_fee_minor: 152146,
      additional_item_fee_minor: 63500,
      source_currency: 'USD',
      source_one_item_fee_minor: 599,
      source_additional_item_fee_minor: 250,
      // numeric(20,10) storage renders the seeded 25400 rate with trailing zeros.
      fx: expect.objectContaining({ rate: expect.stringMatching(/^25400/), source: 'test-rates' }),
    }));

    const orderResponse = await confirmOrder(buyer, quote.quote_id, 'cash');
    expect(orderResponse.status).toBe(201);
    const orderId = orderResponse.body.order_shops[0].id as string;

    const orderRow = await readOrderRow(orderId);
    expect(orderRow.shipping_minor).toBe(215646);
    expect(orderRow.total_minor).toBe(quote.total_minor);
    expect(orderRow.shipping_quote_snapshot.shipping.currency).toBe('VND');
    expect(orderRow.shipping_quote_snapshot.shipping.units[0]).toEqual(
      expect.objectContaining({
        source_currency: 'USD',
        source_one_item_fee_minor: 599,
        fx: expect.objectContaining({ rate: expect.stringMatching(/^25400/) }),
      }),
    );

    // The provider is charged the accepted checkout-currency amount.
    await addCartItem(buyer, product.inventoryId, 2);
    const cardQuote = await createQuote(buyer);
    expect(cardQuote.shipping_minor).toBe(215646);

    const cardOrder = await confirmOrder(buyer, cardQuote.quote_id, 'card');
    expect(cardOrder.status).toBe(201);
    const cardOrderRow = await readOrderRow(cardOrder.body.order_shops[0].id as string);
    const outbox = await sql.query(
      `select "payload" from "outbox_events"
       where "event_name" = 'order.checkout-session-requested'
       order by "created_at" desc limit 1`,
    );
    const payload = outbox.rows[0].payload as {
      shippingAmountMinor: number;
      orderIds: string[];
    };

    expect(payload.orderIds).toContain(cardOrderRow.id);
    expect(payload.shippingAmountMinor).toBe(cardOrderRow.shipping_minor);
    expect(payload.shippingAmountMinor).toBe(215646);
  });
});
