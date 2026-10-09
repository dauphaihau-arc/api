import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
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
describe('Promo code redemption (integration)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: TestDatabase;
  let storageRoot: string;
  let sql: Client;
  let categoryId: string | undefined;
  let testNow: Date;

  async function resolvePromotionId(publicId: string): Promise<string> {
    const result = await sql.query<{ id: string }>(
      'select id from promotions where public_id = $1',
      [publicId],
    );
    return result.rows[0]!.id;
  }

  async function resolveOrderId(publicId: string): Promise<string> {
    const result = await sql.query<{ id: string }>(
      'select id from orders where public_id = $1',
      [publicId],
    );
    return result.rows[0]!.id;
  }

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testNow = new Date();
    testDb = await createTestDatabase('promo-code-redemption');
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-promo-redemption-int-'));

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

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('~/bootstrap/app.module') as typeof BootstrapAppModule;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(new LocalFileStorageService({ driver: 'local', localRoot: storageRoot }))
      .overrideProvider(JobDispatcher)
      .useValue({ dispatch: jest.fn().mockResolvedValue(undefined) })
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

  async function registerSeller(prefix: string, currency = 'USD'): Promise<TestSeller> {
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
        shop_name: `promo${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`,
        currency,
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
      .send({ name: 'Promo Codes', rank: 1 })
      .expect(201);

    categoryId = response.body.id as string;

    return categoryId;
  }

  async function createActiveProfile(
    seller: TestSeller,
    oneItemFeeMinor = 599,
  ): Promise<string> {
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
            one_item_fee_minor: oneItemFeeMinor,
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
        description: 'Promo product',
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

  async function createQuote(
    buyer: TestBuyer,
    promoCodes: { shop_id: string; promo_codes: string[] }[] = [],
  ): Promise<{
    quote_id: string;
    subtotal_minor: number;
    discount_minor: number;
    sale_discount_minor: number;
    shipping_minor: number;
    total_minor: number;
    items: Array<{
      inventory_id: string;
      line_total_minor: number;
      promo_discount_minor: number;
    }>;
    shops: Array<{
      shop_id: string;
      subtotal_minor: number;
      discount_minor: number;
      sale_discount_minor: number;
      shipping_minor: number;
      shipping_discount_minor: number;
      shipping_discounts: Array<{ code: string; waived_minor: number; benefit_type: string }>;
      total_minor: number;
      promo_codes: string[];
    }>;
  }> {
    const response = await buyer.agent
      .post(`${API_PREFIX}/me/checkout/quote`)
      .set('Idempotency-Key', randomUUID())
      .send({
        user_address_id: buyer.addressId,
        addition_info_shop_carts: promoCodes,
      })
      .expect(201);

    return response.body;
  }

  async function applyPromoCode(
    buyer: TestBuyer,
    shopId: string,
    code: string,
    promoCodes: string[] = [],
  ): Promise<{ promo_codes: string[]; applied_promo_codes: Array<{ code: string; type: string }> }> {
    const response = await buyer.agent
      .post(`${API_PREFIX}/cart/promo-codes/apply`)
      .set('Idempotency-Key', randomUUID())
      .send({ shop_id: shopId, code, promo_codes: promoCodes })
      .expect(201);

    return response.body;
  }

  type DiscoverablePromoCode = {
    code: string;
    benefit_type: string;
    product_scope: string;
    percent_off: number | null;
    amount_off: number | null;
    min_order_type: string;
    min_purchase_quantity: number | null;
    end_date: string;
    currency: string;
    is_eligible: boolean;
    ineligible_reason: string | null;
  };

  async function listDiscoverablePromoCodes(
    buyer: TestBuyer,
    shopId: string,
  ): Promise<DiscoverablePromoCode[]> {
    const response = await buyer.agent
      .get(`${API_PREFIX}/cart/promo-codes`)
      .query({ shop_id: shopId })
      .expect(200);

    return response.body.promo_codes as DiscoverablePromoCode[];
  }

  async function createSale(
    seller: TestSeller,
    body: Record<string, unknown>,
  ): Promise<{ id: string; percent_off: number }> {
    const response = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/sales`)
      .set('Idempotency-Key', randomUUID())
      .send(body)
      .expect(201);

    return response.body.sale;
  }

  function endSale(seller: TestSeller, saleId: string) {
    return seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/sales/${saleId}/end`)
      .set('Idempotency-Key', randomUUID());
  }

  async function createPromoCode(
    seller: TestSeller,
    body: Record<string, unknown>,
  ): Promise<{
    id: string;
    code: string;
    benefit_type: string;
    percent_off: number;
    amount_off: number | null;
    product_scope: string;
  }> {
    const response = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/promo-codes`)
      .set('Idempotency-Key', randomUUID())
      .send(body);

    if (response.status === 404) {
      throw new Error(`Promo code creation route returned 404: ${response.body?.message ?? 'Not found'}`);
    }

    expect(response.status).toBe(201);

    return response.body.promo_code;
  }

  function submitCashOrder(buyer: TestBuyer, quoteId: string) {
    return buyer.agent
      .post(`${API_PREFIX}/me/checkout`)
      .set('Idempotency-Key', randomUUID())
      .send({ quote_id: quoteId, payment_type: 'cash' });
  }

  it('applies a percentage promo code after a Sale and records one redemption on commit', async () => {
    const seller = await registerSeller('promo-redemption');
    const profile = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Promo Mug',
      sku: 'PROMO-MUG-1',
      amountMinor: 10_000,
    });

    await createSale(seller, {
      name: 'Autumn Sale',
      percent_off: 20,
      product_scope: 'specific',
      product_ids: [product.productId],
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(Date.now() + TWO_DAYS_MS)),
    });

    await createPromoCode(seller, {
      name: 'October Promo',
      code: 'OCT10',
      percent_off: 10,
      visibility: 'code_only',
      product_scope: 'specific',
      product_ids: [product.productId],
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(Date.now() + TWO_DAYS_MS)),
    });

    const buyer = await registerBuyer('promo-redemption');
    await addCartItem(buyer, product.inventoryId, 1);

    const applyResponse = await applyPromoCode(buyer, seller.shopPublicId, 'oct10');
    expect(applyResponse.promo_codes).toContain('OCT10');
    expect(applyResponse.applied_promo_codes).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'OCT10', benefit_type: 'percentage' }),
    ]));

    // Applying a code must not consume a redemption.
    const usagesAfterApply = await sql.query(
      'select count(*) as count from "promotion_usages"',
    );
    expect(Number(usagesAfterApply.rows[0].count)).toBe(0);

    const quote = await createQuote(buyer, [{
      shop_id: seller.shopPublicId,
      promo_codes: applyResponse.promo_codes,
    }]);
    const quoteShop = quote.shops.find((shop) => shop.shop_id === seller.shopPublicId);
    expect(quoteShop).toBeDefined();
    expect(quoteShop?.promo_codes).toContain('OCT10');

    // Regular price 10000, 20% Sale -> 8000, 10% code on 8000 -> 7200.
    // Subtotal is already net of the Sale, so subtotal = 8000.
    expect(quoteShop?.subtotal_minor).toBe(8000);
    expect(quoteShop?.sale_discount_minor).toBe(2000);
    expect(quoteShop?.discount_minor).toBe(800);
    expect(quoteShop?.total_minor).toBe(8000 - 800 + 599);
    expect(quote.sale_discount_minor).toBe(2000);
    expect(quote.discount_minor).toBe(800);

    // Quoting must not consume a redemption either.
    const usagesAfterQuote = await sql.query(
      'select count(*) as count from "promotion_usages"',
    );
    expect(Number(usagesAfterQuote.rows[0].count)).toBe(0);

    const orderResponse = await submitCashOrder(buyer, quote.quote_id).expect(201);
    const orderShopId = await resolveOrderId(orderResponse.body.order_shops[0].id as string);

    const orderRow = await sql.query(
      'select "promo_codes", "discount_minor", "sale_discount_minor" from "orders" where "id" = $1',
      [orderShopId],
    );
    expect(orderRow.rows[0].promo_codes).toContain('OCT10');
    expect(Number(orderRow.rows[0].discount_minor)).toBe(800);
    expect(Number(orderRow.rows[0].sale_discount_minor)).toBe(2000);

    const usagesAfterCommit = await sql.query(
      'select count(*) as count from "promotion_usages" where "order_id" = $1',
      [orderShopId],
    );
    expect(Number(usagesAfterCommit.rows[0].count)).toBe(1);
  });

  it('ends a running promo code: discovery and application stop while usages and order facts remain', async () => {
    const seller = await registerSeller('promo-stop');
    const profile = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Stop Promo Mug',
      sku: 'STOP-PROMO-1',
      amountMinor: 10_000,
    });

    const created = await createPromoCode(seller, {
      name: 'Stoppable ten',
      code: 'STOP10',
      percent_off: 10,
      visibility: 'public',
      product_scope: 'all',
      ...activeWindow(),
    });

    const buyer = await registerBuyer('promo-stop');
    await addCartItem(buyer, product.inventoryId, 1);

    const discoveredBefore = await listDiscoverablePromoCodes(buyer, seller.shopPublicId);
    expect(discoveredBefore.map(promoCode => promoCode.code)).toContain('STOP10');

    const applied = await applyPromoCode(buyer, seller.shopPublicId, 'STOP10');
    const quote = await createQuote(buyer, [{
      shop_id: seller.shopPublicId,
      promo_codes: applied.promo_codes,
    }]);
    expect(quote.shops.find(shop => shop.shop_id === seller.shopPublicId)?.discount_minor).toBe(1000);

    const orderResponse = await submitCashOrder(buyer, quote.quote_id).expect(201);
    const orderShopId = await resolveOrderId(orderResponse.body.order_shops[0].id as string);
    const usagesAfterCommit = await sql.query(
      'select count(*) as count from "promotion_usages" where "promotion_id" = $1',
      [await resolvePromotionId(created.id)],
    );
    expect(Number(usagesAfterCommit.rows[0].count)).toBe(1);

    // The seller irreversibly ends the running code.
    const ended = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/promo-codes/${created.id}/end`)
      .set('Idempotency-Key', randomUUID())
      .expect(201);
    expect(ended.body.promo_code.status).toBe('ended');
    expect(ended.body.promo_code.redemption_count).toBe(1);

    // The stopped code is gone from public discovery and can no longer be applied.
    const discoveredAfter = await listDiscoverablePromoCodes(buyer, seller.shopPublicId);
    expect(discoveredAfter.map(promoCode => promoCode.code)).not.toContain('STOP10');

    await buyer.agent
      .post(`${API_PREFIX}/cart/promo-codes/apply`)
      .set('Idempotency-Key', randomUUID())
      .send({ shop_id: seller.shopPublicId, code: 'STOP10', promo_codes: [] })
      .expect(404);

    // Retained evidence: the code identity, its consumed redemption and the
    // committed Order reference survive the stop.
    const usageRows = await sql.query(
      'select "order_id", "code" from "promotion_usages" where "promotion_id" = $1',
      [await resolvePromotionId(created.id)],
    );
    expect(usageRows.rows).toHaveLength(1);
    expect(usageRows.rows[0].order_id).toBe(orderShopId);
    expect(usageRows.rows[0].code).toBe('STOP10');

    const orderRow = await sql.query(
      'select "promo_codes" from "orders" where "id" = $1',
      [orderShopId],
    );
    expect(orderRow.rows[0].promo_codes).toContain('STOP10');

    // The seller list still explains the stopped offer rather than removing it.
    const listed = await seller.agent
      .get(`${API_PREFIX}/shops/${seller.shopPublicId}/promo-codes`)
      .expect(200);
    const listedEntry = (listed.body.results as Array<{ id: string, status: string, code: string }>)
      .find(entry => entry.id === created.id);
    expect(listedEntry).toMatchObject({ code: 'STOP10', status: 'ended' });
  });

  function activeWindow() {
    return {
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(testNow.getTime() + TWO_DAYS_MS)),
    };
  }

  it('discovers only active public promo codes and flags an ineligible offer with a reason', async () => {
    const seller = await registerSeller('promo-discovery');
    const profile = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Discovery Mug',
      sku: 'DISC-MUG-1',
      amountMinor: 10_000,
    });
    const otherProduct = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Discovery Shirt',
      sku: 'DISC-SHIRT-1',
      amountMinor: 5_000,
    });

    await createPromoCode(seller, {
      name: 'Public ten', code: 'PUB10', percent_off: 10, visibility: 'public', product_scope: 'all', ...activeWindow(),
    });
    await createPromoCode(seller, {
      name: 'Hidden ten', code: 'HIDDEN10', percent_off: 10, visibility: 'code_only', product_scope: 'all', ...activeWindow(),
    });
    await createPromoCode(seller, {
      name: 'Future ten',
      code: 'FUTURE10',
      percent_off: 10,
      visibility: 'public',
      product_scope: 'all',
      timezone: 'UTC',
      start_local: utcLocalDateTime(new Date(testNow.getTime() + TWO_DAYS_MS)),
      end_local: utcLocalDateTime(new Date(testNow.getTime() + (4 * DAY_MS))),
    });
    await createPromoCode(seller, {
      name: 'Ended ten',
      code: 'ENDED10',
      percent_off: 10,
      visibility: 'public',
      product_scope: 'all',
      timezone: 'UTC',
      start_local: utcLocalDateTime(new Date(testNow.getTime() - (4 * DAY_MS))),
      end_local: utcLocalDateTime(new Date(testNow.getTime() - TWO_DAYS_MS)),
    });
    await createPromoCode(seller, {
      name: 'Shirt only',
      code: 'SHIRTONLY',
      percent_off: 10,
      visibility: 'public',
      product_scope: 'specific',
      product_ids: [otherProduct.productId],
      ...activeWindow(),
    });

    // Stopped through the seller endpoint: a running code that stops being
    // discoverable the moment it is irreversibly ended.
    const stoppedPromo = await createPromoCode(seller, {
      name: 'Stopped ten', code: 'STOPPED10', percent_off: 10, visibility: 'public', product_scope: 'all', ...activeWindow(),
    });
    await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/promo-codes/${stoppedPromo.id}/end`)
      .set('Idempotency-Key', randomUUID())
      .expect(201);

    const exhaustedPromo = await createPromoCode(seller, {
      name: 'Exhausted ten', code: 'EXHAUST10', percent_off: 10, visibility: 'public', product_scope: 'all', ...activeWindow(),
    });
    await sql.query('update "promotions" set "max_redemptions" = 1 where "public_id" = $1', [exhaustedPromo.id]);
    await sql.query(
      `insert into "promotion_usages" ("id","created_at","updated_at","promotion_id","order_id","code")
       values ($1, now(), now(), $2, $3, $4)`,
      [randomUUID(), await resolvePromotionId(exhaustedPromo.id), randomUUID(), 'EXHAUST10'],
    );

    const buyer = await registerBuyer('promo-discovery');
    await addCartItem(buyer, product.inventoryId, 1);

    const promoCodes = await listDiscoverablePromoCodes(buyer, seller.shopPublicId);
    const byCode = new Map(promoCodes.map((promoCode) => [promoCode.code, promoCode]));

    expect(byCode.get('PUB10')).toMatchObject({
      is_eligible: true,
      ineligible_reason: null,
      percent_off: 10,
      currency: 'USD',
    });
    expect(byCode.get('SHIRTONLY')).toMatchObject({
      is_eligible: false,
      ineligible_reason: 'product_scope',
    });
    expect(byCode.has('HIDDEN10')).toBe(false);
    expect(byCode.has('FUTURE10')).toBe(false);
    expect(byCode.has('ENDED10')).toBe(false);
    expect(byCode.has('STOPPED10')).toBe(false);
    expect(byCode.has('EXHAUST10')).toBe(false);
  });

  it('resolves discovery and manual entry with the same rule and replaces the discount slot', async () => {
    const seller = await registerSeller('promo-equivalence');
    const profile = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Equivalence Mug',
      sku: 'EQ-MUG-1',
      amountMinor: 10_000,
    });
    const otherProduct = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Equivalence Shirt',
      sku: 'EQ-SHIRT-1',
      amountMinor: 5_000,
    });

    await createPromoCode(seller, {
      name: 'Ten', code: 'EQTEN', percent_off: 10, visibility: 'public', product_scope: 'all', ...activeWindow(),
    });
    await createPromoCode(seller, {
      name: 'Twenty', code: 'EQTWENTY', percent_off: 20, visibility: 'public', product_scope: 'all', ...activeWindow(),
    });
    await createPromoCode(seller, {
      name: 'Shirt only',
      code: 'EQSHIRT',
      percent_off: 10,
      visibility: 'public',
      product_scope: 'specific',
      product_ids: [otherProduct.productId],
      ...activeWindow(),
    });

    const buyer = await registerBuyer('promo-equivalence');
    await addCartItem(buyer, product.inventoryId, 1);

    const promoCodes = await listDiscoverablePromoCodes(buyer, seller.shopPublicId);
    expect(promoCodes.find((promoCode) => promoCode.code === 'EQTEN')).toMatchObject({
      is_eligible: true,
      percent_off: 10,
    });

    // Picker selection and manual entry both resolve through the apply rule.
    const manual = await applyPromoCode(buyer, seller.shopPublicId, 'eqten');
    expect(manual.applied_promo_codes).toEqual([{ code: 'EQTEN', benefit_type: 'percentage' }]);

    // An eligible replacement replaces the product-discount slot code.
    const replaced = await applyPromoCode(buyer, seller.shopPublicId, 'eqtwenty', manual.promo_codes);
    expect(replaced.promo_codes).toEqual(['EQTWENTY']);

    // An invalid replacement is rejected and leaves the previous selection intact.
    await buyer.agent
      .post(`${API_PREFIX}/cart/promo-codes/apply`)
      .set('Idempotency-Key', randomUUID())
      .send({ shop_id: seller.shopPublicId, code: 'eqshirt', promo_codes: replaced.promo_codes })
      .expect(422);

    const quote = await createQuote(buyer, [{
      shop_id: seller.shopPublicId,
      promo_codes: replaced.promo_codes,
    }]);
    const quoteShop = quote.shops.find((shop) => shop.shop_id === seller.shopPublicId);
    expect(quoteShop?.promo_codes).toEqual(['EQTWENTY']);
    expect(quoteShop?.discount_minor).toBe(2000);
  });

  it('rejects a public code that rounds to no saving and consumes no redemption', async () => {
    const seller = await registerSeller('promo-zero');
    const profile = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Penny Mug',
      sku: 'ZERO-MUG-1',
      amountMinor: 1,
    });

    await createPromoCode(seller, {
      name: 'One percent', code: 'ONEPCT', percent_off: 1, visibility: 'public', product_scope: 'all', ...activeWindow(),
    });

    const buyer = await registerBuyer('promo-zero');
    await addCartItem(buyer, product.inventoryId, 1);

    const promoCodes = await listDiscoverablePromoCodes(buyer, seller.shopPublicId);
    expect(promoCodes.find((promoCode) => promoCode.code === 'ONEPCT')).toMatchObject({
      is_eligible: false,
      ineligible_reason: 'zero_benefit',
    });

    await buyer.agent
      .post(`${API_PREFIX}/cart/promo-codes/apply`)
      .set('Idempotency-Key', randomUUID())
      .send({ shop_id: seller.shopPublicId, code: 'onepct', promo_codes: [] })
      .expect(422);

    const usages = await sql.query(
      'select count(*) as count from "promotion_usages" where "code" = $1',
      ['ONEPCT'],
    );
    expect(Number(usages.rows[0].count)).toBe(0);
  });

  it('rechecks eligibility at Order commitment so a now-ineligible code consumes nothing', async () => {
    const seller = await registerSeller('promo-recheck');
    const profile = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Recheck Mug',
      sku: 'RECHECK-MUG-1',
      amountMinor: 10_000,
    });

    const promo = await createPromoCode(seller, {
      name: 'Limitable', code: 'LIMITED10', percent_off: 10, visibility: 'code_only', product_scope: 'all', ...activeWindow(),
    });

    // Cap the offer at a single global redemption, as a later ticket's limits will.
    await sql.query('update "promotions" set "max_redemptions" = 1 where "public_id" = $1', [promo.id]);

    const buyer = await registerBuyer('promo-recheck');
    await addCartItem(buyer, product.inventoryId, 1);

    const applied = await applyPromoCode(buyer, seller.shopPublicId, 'limited10');
    const quote = await createQuote(buyer, [{
      shop_id: seller.shopPublicId,
      promo_codes: applied.promo_codes,
    }]);
    const quoteShop = quote.shops.find((shop) => shop.shop_id === seller.shopPublicId);
    expect(quoteShop?.discount_minor).toBe(1000);

    // Another buyer takes the last redemption between quote and commitment.
    await sql.query(
      `insert into "promotion_usages" ("id","created_at","updated_at","promotion_id","order_id","code")
       values ($1, now(), now(), $2, $3, $4)`,
      [randomUUID(), await resolvePromotionId(promo.id), randomUUID(), 'LIMITED10'],
    );

    await submitCashOrder(buyer, quote.quote_id).expect(409);

    const orders = await sql.query(
      'select count(*) as count from "orders" where "user_id" = $1',
      [buyer.userId],
    );
    expect(Number(orders.rows[0].count)).toBe(0);

    const usages = await sql.query(
      'select count(*) as count from "promotion_usages" where "promotion_id" = $1',
      [await resolvePromotionId(promo.id)],
    );
    expect(Number(usages.rows[0].count)).toBe(1);
  });

  it('serializes concurrent commitments so a total limit is never oversubscribed', async () => {
    const seller = await registerSeller('promo-concurrent');
    const profile = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Race Mug',
      sku: 'RACE-MUG-1',
      amountMinor: 10_000,
    });

    const promo = await createPromoCode(seller, {
      name: 'Last One',
      code: 'LASTONE',
      percent_off: 10,
      visibility: 'code_only',
      product_scope: 'all',
      max_redemptions: 1,
      ...activeWindow(),
    });

    const buyerA = await registerBuyer('promo-race-a');
    const buyerB = await registerBuyer('promo-race-b');
    const quoteIds: string[] = [];

    for (const buyer of [buyerA, buyerB]) {
      await addCartItem(buyer, product.inventoryId, 1);
      const applied = await applyPromoCode(buyer, seller.shopPublicId, 'LASTONE');
      const quote = await createQuote(buyer, [{
        shop_id: seller.shopPublicId,
        promo_codes: applied.promo_codes,
      }]);
      quoteIds.push(quote.quote_id);
    }

    // Hold the Promotion row so both commitments pass their pre-commit recheck,
    // enter their transaction, and block on the same allowance lock. Releasing
    // it serializes them: one consumes the single allowance, the other must
    // observe it and roll back without creating an Order.
    const barrier = new Client({
      host: testDb.rootConfig.host,
      port: testDb.rootConfig.port,
      user: testDb.rootConfig.user,
      password: testDb.rootConfig.password,
      database: testDb.dbName,
    });
    await barrier.connect();
    await barrier.query('begin');
    await barrier.query(
      'select "id" from "promotions" where "public_id" = $1 for update',
      [promo.id],
    );

    const pending = [
      submitCashOrder(buyerA, quoteIds[0]),
      submitCashOrder(buyerB, quoteIds[1]),
    ];

    await delay(500);

    await barrier.query('commit');
    await barrier.end();

    const responses = await Promise.all(pending);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);

    const rejected = responses.find((response) => response.status === 409)!;
    expect(rejected.body.code).toBe('CHECKOUT_QUOTE_PRICES_CHANGED');
    expect(rejected.body.refreshed_totals.discount_minor).toBe(0);

    const usages = await sql.query(
      'select count(*) as count from "promotion_usages" where "promotion_id" = $1',
      [await resolvePromotionId(promo.id)],
    );
    expect(Number(usages.rows[0].count)).toBe(1);

    const orders = await sql.query(
      'select count(*) as count from "orders" where "shop_id" = $1',
      [seller.shopId],
    );
    expect(Number(orders.rows[0].count)).toBe(1);
  });

  it('does not consume a second redemption when the same committed submission is retried', async () => {
    const seller = await registerSeller('promo-retry');
    const profile = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Retry Mug',
      sku: 'RETRY-MUG-1',
      amountMinor: 10_000,
    });

    await createPromoCode(seller, {
      name: 'Retry Once',
      code: 'RETRYONCE',
      percent_off: 10,
      visibility: 'code_only',
      product_scope: 'all',
      max_redemptions: 1,
      ...activeWindow(),
    });

    const buyer = await registerBuyer('promo-retry');
    await addCartItem(buyer, product.inventoryId, 1);
    const applied = await applyPromoCode(buyer, seller.shopPublicId, 'RETRYONCE');
    const quote = await createQuote(buyer, [{
      shop_id: seller.shopPublicId,
      promo_codes: applied.promo_codes,
    }]);

    await submitCashOrder(buyer, quote.quote_id).expect(201);

    const retry = await submitCashOrder(buyer, quote.quote_id);
    expect(retry.status).toBeGreaterThanOrEqual(400);

    const usages = await sql.query(
      'select count(*) as count from "promotion_usages" where "code" = $1',
      ['RETRYONCE'],
    );
    expect(Number(usages.rows[0].count)).toBe(1);
  });

  it('does not restore a consumed redemption when the committed order is cancelled', async () => {
    const seller = await registerSeller('promo-cancel');
    const profile = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Cancel Mug',
      sku: 'CANCEL-MUG-1',
      amountMinor: 10_000,
    });

    await createPromoCode(seller, {
      name: 'Cancel Once',
      code: 'CANCELONCE',
      percent_off: 10,
      visibility: 'code_only',
      product_scope: 'all',
      max_redemptions: 1,
      ...activeWindow(),
    });

    const buyer = await registerBuyer('promo-cancel');
    await addCartItem(buyer, product.inventoryId, 1);
    const applied = await applyPromoCode(buyer, seller.shopPublicId, 'CANCELONCE');
    const quote = await createQuote(buyer, [{
      shop_id: seller.shopPublicId,
      promo_codes: applied.promo_codes,
    }]);

    const orderResponse = await submitCashOrder(buyer, quote.quote_id).expect(201);
    const createdOrderShop = orderResponse.body.order_shops[0] as { id: string };
    const orderPublicId = createdOrderShop.id;

    await buyer.agent
      .patch(`${API_PREFIX}/me/orders/${orderPublicId}/cancel-request`)
      .set('Idempotency-Key', randomUUID())
      .send({ cancel_reason: 'changed my mind' })
      .expect(200);

    const usages = await sql.query(
      'select count(*) as count from "promotion_usages" where "code" = $1',
      ['CANCELONCE'],
    );
    expect(Number(usages.rows[0].count)).toBe(1);

    const list = await seller.agent
      .get(`${API_PREFIX}/shops/${seller.shopPublicId}/promo-codes`)
      .query({ limit: 100 })
      .expect(200);
    const listed = list.body.results.find(
      (entry: { code: string }) => entry.code === 'CANCELONCE',
    );
    expect(listed.redemption_count).toBe(1);
    expect(listed.exhausted).toBe(true);
  });

  it('enforces an authenticated per-buyer limit against the same buyer', async () => {
    const seller = await registerSeller('promo-per-buyer');
    const profile = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Per Buyer Mug',
      sku: 'PERBUYER-MUG-1',
      amountMinor: 10_000,
    });

    await createPromoCode(seller, {
      name: 'One Per Buyer',
      code: 'ONEPERBUYER',
      percent_off: 10,
      visibility: 'code_only',
      product_scope: 'all',
      max_redemptions_per_buyer: 1,
      ...activeWindow(),
    });

    const buyer = await registerBuyer('promo-per-buyer');
    await addCartItem(buyer, product.inventoryId, 1);
    const applied = await applyPromoCode(buyer, seller.shopPublicId, 'ONEPERBUYER');
    const quote = await createQuote(buyer, [{
      shop_id: seller.shopPublicId,
      promo_codes: applied.promo_codes,
    }]);

    await submitCashOrder(buyer, quote.quote_id).expect(201);

    await addCartItem(buyer, product.inventoryId, 1);
    const secondApply = await buyer.agent
      .post(`${API_PREFIX}/cart/promo-codes/apply`)
      .set('Idempotency-Key', randomUUID())
      .send({ shop_id: seller.shopPublicId, code: 'ONEPERBUYER', promo_codes: [] });

    expect(secondApply.status).toBe(422);
    expect(secondApply.body.reason).toBe('user_usage_limit_reached');

    const usages = await sql.query(
      'select count(*) as count from "promotion_usages" where "code" = $1',
      ['ONEPERBUYER'],
    );
    expect(Number(usages.rows[0].count)).toBe(1);
  });

  it('rejects an exhausted code at apply with the usage-limit reason', async () => {
    const seller = await registerSeller('promo-apply-exhausted');
    const profile = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Exhausted Mug',
      sku: 'EXHAUSTED-MUG-1',
      amountMinor: 10_000,
    });

    await createPromoCode(seller, {
      name: 'Single Use Only',
      code: 'NOIRLIMIT',
      percent_off: 10,
      visibility: 'public',
      product_scope: 'all',
      max_redemptions: 1,
      ...activeWindow(),
    });

    const first = await registerBuyer('promo-apply-first');
    await addCartItem(first, product.inventoryId, 1);
    const firstApply = await applyPromoCode(first, seller.shopPublicId, 'NOIRLIMIT');
    const firstQuote = await createQuote(first, [{
      shop_id: seller.shopPublicId,
      promo_codes: firstApply.promo_codes,
    }]);
    await submitCashOrder(first, firstQuote.quote_id).expect(201);

    const second = await registerBuyer('promo-apply-second');
    await addCartItem(second, product.inventoryId, 1);

    const rejected = await second.agent
      .post(`${API_PREFIX}/cart/promo-codes/apply`)
      .set('Idempotency-Key', randomUUID())
      .send({ shop_id: seller.shopPublicId, code: 'NOIRLIMIT', promo_codes: [] })
      .expect(422);

    expect(rejected.body.reason).toBe('usage_limit_reached');
    expect(rejected.body.message).toMatch(/cannot be applied/i);

    const usages = await sql.query(
      'select count(*) as count from "promotion_usages" where "code" = $1',
      ['NOIRLIMIT'],
    );
    expect(Number(usages.rows[0].count)).toBe(1);

    const orders = await sql.query(
      'select count(*) as count from "orders" where "user_id" = $1',
      [second.userId],
    );
    expect(Number(orders.rows[0].count)).toBe(0);
  });

  it('applies a fixed amount once across eligible items without touching untargeted items or shipping', async () => {
    const seller = await registerSeller('promo-fixed');
    const profile = await createActiveProfile(seller);
    const shirt = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Fixed Shirt',
      sku: 'FIX-SHIRT-1',
      amountMinor: 6_000,
    });
    const shoes = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Fixed Shoes',
      sku: 'FIX-SHOES-1',
      amountMinor: 4_000,
    });

    await createPromoCode(seller, {
      name: 'Fixed fifty',
      code: 'FIX50',
      benefit_type: 'fixed_amount',
      amount_off: 50,
      visibility: 'code_only',
      product_scope: 'specific',
      product_ids: [shirt.productId],
      min_order_type: 'none',
      ...activeWindow(),
    });

    const buyer = await registerBuyer('promo-fixed');
    await addCartItem(buyer, shirt.inventoryId, 2);
    await addCartItem(buyer, shoes.inventoryId, 1);

    const applied = await applyPromoCode(buyer, seller.shopPublicId, 'fix50');
    expect(applied.applied_promo_codes).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'FIX50', benefit_type: 'fixed_amount' }),
    ]));

    // Accepting the code on the cart page prices the cart and returns the
    // per-shop discount, so the shop's own summary shows the same saving as the
    // overall Summary Order before checkout.
    const pricedCart = await buyer.agent
      .patch(`${API_PREFIX}/cart/items`)
      .set('Idempotency-Key', randomUUID())
      .send({
        addition_info_shop_carts: [{
          shop_id: seller.shopPublicId,
          promo_codes: applied.promo_codes,
        }],
      })
      .expect(200);
    const pricedGroup = (pricedCart.body.cart.shop_groups as Array<{
      shop: { id: string };
      discount_minor: number;
    }>).find((group) => group.shop.id === seller.shopPublicId);
    expect(pricedGroup?.discount_minor).toBe(5_000);

    const quote = await createQuote(buyer, [{
      shop_id: seller.shopPublicId,
      promo_codes: applied.promo_codes,
    }]);
    const quoteShop = quote.shops.find((shop) => shop.shop_id === seller.shopPublicId);

    // 2 shirts (12000 eligible) + 1 pair of shoes (4000 untargeted). The fixed
    // 50.00 is granted once, not per eligible item or per unit.
    expect(quoteShop?.subtotal_minor).toBe(16_000);
    expect(quoteShop?.discount_minor).toBe(5_000);

    // The allocation lands only on eligible lines and reconciles exactly.
    const allocatedTotal = quote.items.reduce(
      (total, item) => total + item.promo_discount_minor,
      0,
    );
    expect(allocatedTotal).toBe(5_000);
    expect(quote.items.find((item) => item.inventory_id === shirt.inventoryId)?.promo_discount_minor)
      .toBe(5_000);
    expect(quote.items.find((item) => item.inventory_id === shoes.inventoryId)?.promo_discount_minor)
      .toBe(0);
  });

  it('caps a fixed amount at the eligible merchandise value and never discounts shipping', async () => {
    const seller = await registerSeller('promo-cap');
    const profile = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Cap Mug',
      sku: 'CAP-MUG-1',
      amountMinor: 6_000,
    });

    await createPromoCode(seller, {
      name: 'Huge fixed',
      code: 'HUGE200',
      benefit_type: 'fixed_amount',
      amount_off: 200,
      visibility: 'code_only',
      product_scope: 'specific',
      product_ids: [product.productId],
      min_order_type: 'none',
      ...activeWindow(),
    });

    const buyer = await registerBuyer('promo-cap');
    await addCartItem(buyer, product.inventoryId, 1);

    const applied = await applyPromoCode(buyer, seller.shopPublicId, 'huge200');
    const quote = await createQuote(buyer, [{
      shop_id: seller.shopPublicId,
      promo_codes: applied.promo_codes,
    }]);
    const quoteShop = quote.shops.find((shop) => shop.shop_id === seller.shopPublicId);

    // The 200.00 benefit is capped at the 60.00 eligible subtotal; the single
    // item's Shipping Charge (599) is untouched and the total cannot go negative.
    expect(quoteShop?.subtotal_minor).toBe(6_000);
    expect(quoteShop?.discount_minor).toBe(6_000);
    expect(quoteShop?.total_minor).toBe(599);
  });

  it('uses the eligible merchandise subtotal for a minimum spend and ignores untargeted items', async () => {
    const seller = await registerSeller('promo-minspend');
    const profile = await createActiveProfile(seller);
    const shirt = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Minimum Shirt',
      sku: 'MIN-SHIRT-1',
      amountMinor: 6_000,
    });
    const shoes = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Minimum Shoes',
      sku: 'MIN-SHOES-1',
      amountMinor: 4_000,
    });

    await createPromoCode(seller, {
      name: 'Ten over hundred',
      code: 'MIN100',
      benefit_type: 'percentage',
      percent_off: 10,
      visibility: 'code_only',
      product_scope: 'specific',
      product_ids: [shirt.productId],
      min_order_type: 'order_total',
      min_order_value: 100,
      ...activeWindow(),
    });

    const buyer = await registerBuyer('promo-minspend');
    await addCartItem(buyer, shirt.inventoryId, 1);
    await addCartItem(buyer, shoes.inventoryId, 1);

    // The cart total is 100.00 but only the 60.00 of targeted shirts is eligible.
    await buyer.agent
      .post(`${API_PREFIX}/cart/promo-codes/apply`)
      .set('Idempotency-Key', randomUUID())
      .send({ shop_id: seller.shopPublicId, code: 'min100', promo_codes: [] })
      .expect(422);

    await addCartItem(buyer, shirt.inventoryId, 1);

    const applied = await applyPromoCode(buyer, seller.shopPublicId, 'min100');
    const quote = await createQuote(buyer, [{
      shop_id: seller.shopPublicId,
      promo_codes: applied.promo_codes,
    }]);
    const quoteShop = quote.shops.find((shop) => shop.shop_id === seller.shopPublicId);

    // Eligible subtotal is now 120.00, so 10% of the targeted shirts applies.
    expect(quoteShop?.subtotal_minor).toBe(16_000);
    expect(quoteShop?.discount_minor).toBe(1_200);
  });

  it('counts eligible units, not distinct products, for a minimum quantity', async () => {
    const seller = await registerSeller('promo-minqty');
    const profile = await createActiveProfile(seller);
    const shirt = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Quantity Shirt',
      sku: 'QTY-SHIRT-1',
      amountMinor: 6_000,
    });
    const shoes = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Quantity Shoes',
      sku: 'QTY-SHOES-1',
      amountMinor: 4_000,
    });

    await createPromoCode(seller, {
      name: 'Three shirts',
      code: 'QTY3',
      benefit_type: 'fixed_amount',
      amount_off: 5,
      visibility: 'code_only',
      product_scope: 'specific',
      product_ids: [shirt.productId],
      min_order_type: 'purchase_quantity',
      min_purchase_quantity: 3,
      ...activeWindow(),
    });

    const buyer = await registerBuyer('promo-minqty');
    await addCartItem(buyer, shirt.inventoryId, 2);
    await addCartItem(buyer, shoes.inventoryId, 5);

    // Seven units are in the cart, but only two are eligible shirts.
    await buyer.agent
      .post(`${API_PREFIX}/cart/promo-codes/apply`)
      .set('Idempotency-Key', randomUUID())
      .send({ shop_id: seller.shopPublicId, code: 'qty3', promo_codes: [] })
      .expect(422);

    await addCartItem(buyer, shirt.inventoryId, 1);

    const applied = await applyPromoCode(buyer, seller.shopPublicId, 'qty3');
    const quote = await createQuote(buyer, [{
      shop_id: seller.shopPublicId,
      promo_codes: applied.promo_codes,
    }]);
    const quoteShop = quote.shops.find((shop) => shop.shop_id === seller.shopPublicId);

    expect(quoteShop?.discount_minor).toBe(500);
  });

  it('converts a fixed amount from its Promotion Currency and rejects a missing rate', async () => {
    await sql.query(
      `insert into "exchange_rates"
         ("id", "created_at", "updated_at", "from_currency", "to_currency", "rate",
          "effective_at", "expires_at", "source", "source_timestamp")
       values ($1, now(), now(), 'USD', 'VND', '24803.0000000000',
          now() - interval '1 day', null, 'integration-test', null)`,
      [randomUUID()],
    );

    const usdSeller = await registerSeller('promo-fx');
    const usdProfile = await createActiveProfile(usdSeller);
    const usdProduct = await createPublishedProduct({
      seller: usdSeller,
      shippingProfileId: usdProfile,
      title: 'Fx Bowl',
      sku: 'FX-BOWL-PROMO',
      amountMinor: 500_000,
    });
    await sql.query(
      'update "variant_prices" set "currency" = $2 where "product_inventory_id" = $1',
      [usdProduct.inventoryId, 'VND'],
    );

    await createPromoCode(usdSeller, {
      name: 'Twelve dollars',
      code: 'FX12USD',
      benefit_type: 'fixed_amount',
      amount_off: 12,
      visibility: 'code_only',
      product_scope: 'all',
      min_order_type: 'none',
      ...activeWindow(),
    });

    const usdBuyer = await registerBuyer('promo-fx');
    await addCartItem(usdBuyer, usdProduct.inventoryId, 1);

    const applied = await applyPromoCode(usdBuyer, usdSeller.shopPublicId, 'fx12usd');
    const quote = await createQuote(usdBuyer, [{
      shop_id: usdSeller.shopPublicId,
      promo_codes: applied.promo_codes,
    }]);
    const quoteShop = quote.shops.find((shop) => shop.shop_id === usdSeller.shopPublicId);

    // 12 USD at the seeded USD->VND rate, applied to VND merchandise.
    expect(quoteShop?.discount_minor).toBe(297_636);

    // A fixed amount whose currency has no rate cannot be reinterpreted: the
    // offer is rejected instead of charging its face value.
    const eurSeller = await registerSeller('promo-fx-missing', 'EUR');
    const eurProfile = await createActiveProfile(eurSeller);
    const eurProduct = await createPublishedProduct({
      seller: eurSeller,
      shippingProfileId: eurProfile,
      title: 'No Rate Bowl',
      sku: 'FX-NORATE-PROMO',
      amountMinor: 500_000,
    });
    await sql.query(
      'update "variant_prices" set "currency" = $2 where "product_inventory_id" = $1',
      [eurProduct.inventoryId, 'VND'],
    );

    await createPromoCode(eurSeller, {
      name: 'Ten euros',
      code: 'FX10EUR',
      benefit_type: 'fixed_amount',
      amount_off: 10,
      visibility: 'code_only',
      product_scope: 'all',
      min_order_type: 'none',
      ...activeWindow(),
    });

    const eurBuyer = await registerBuyer('promo-fx-missing');
    await addCartItem(eurBuyer, eurProduct.inventoryId, 1);

    await eurBuyer.agent
      .post(`${API_PREFIX}/cart/promo-codes/apply`)
      .set('Idempotency-Key', randomUUID())
      .send({ shop_id: eurSeller.shopPublicId, code: 'fx10eur', promo_codes: [] })
      .expect(422);
  });

  it('rejects zero-value and contradictory benefit or condition combinations', async () => {
    const seller = await registerSeller('promo-invalid');
    const base = {
      name: 'Invalid promo',
      visibility: 'code_only',
      product_scope: 'all',
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(testNow.getTime() + TWO_DAYS_MS)),
    };
    const create = (body: Record<string, unknown>) =>
      seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopPublicId}/promo-codes`)
        .set('Idempotency-Key', randomUUID())
        .send(body);

    // A fixed amount must be positive.
    await create({
      ...base, code: 'BADFIXED', benefit_type: 'fixed_amount', amount_off: 0,
    }).expect(400);

    // A percentage and a fixed amount cannot coexist.
    await create({
      ...base, code: 'BADBOTH', benefit_type: 'percentage', percent_off: 10, amount_off: 5,
    }).expect(400);

    // A minimum spend must be positive.
    await create({
      ...base,
      code: 'BADMINSPEND',
      benefit_type: 'percentage',
      percent_off: 10,
      min_order_type: 'order_total',
      min_order_value: 0,
    }).expect(400);

    // A selected minimum type cannot carry the other minimum's value.
    await create({
      ...base,
      code: 'BADMINNONE',
      benefit_type: 'percentage',
      percent_off: 10,
      min_order_type: 'none',
      min_order_value: 10,
    }).expect(400);

    // A minimum quantity must be at least one.
    await create({
      ...base,
      code: 'BADMINQTY',
      benefit_type: 'percentage',
      percent_off: 10,
      min_order_type: 'purchase_quantity',
      min_purchase_quantity: 0,
    }).expect(400);
  });

  it('measures a minimum spend on eligible merchandise after a Sale, not on the regular price', async () => {
    const seller = await registerSeller('promo-minspend-sale');
    const profile = await createActiveProfile(seller);
    const shirt = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Discounted Shirt',
      sku: 'MINSALE-SHIRT-1',
      amountMinor: 4_000,
    });

    await createSale(seller, {
      name: 'Half off',
      percent_off: 50,
      product_scope: 'specific',
      product_ids: [shirt.productId],
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(testNow.getTime() + TWO_DAYS_MS)),
    });

    await createPromoCode(seller, {
      name: 'Ten over fifty',
      code: 'MINSALE50',
      benefit_type: 'percentage',
      percent_off: 10,
      visibility: 'code_only',
      product_scope: 'specific',
      product_ids: [shirt.productId],
      min_order_type: 'order_total',
      min_order_value: 50,
      ...activeWindow(),
    });

    const buyer = await registerBuyer('promo-minspend-sale');
    await addCartItem(buyer, shirt.inventoryId, 2);

    // Two shirts cost 80.00 at the regular price but only 40.00 after the 50%
    // Sale, which is below the 50.00 minimum.
    await buyer.agent
      .post(`${API_PREFIX}/cart/promo-codes/apply`)
      .set('Idempotency-Key', randomUUID())
      .send({ shop_id: seller.shopPublicId, code: 'minsale50', promo_codes: [] })
      .expect(422);

    await addCartItem(buyer, shirt.inventoryId, 1);

    const applied = await applyPromoCode(buyer, seller.shopPublicId, 'minsale50');
    const quote = await createQuote(buyer, [{
      shop_id: seller.shopPublicId,
      promo_codes: applied.promo_codes,
    }]);
    const quoteShop = quote.shops.find((shop) => shop.shop_id === seller.shopPublicId);

    // Three shirts are 60.00 after the Sale, so 10% of the post-Sale eligible
    // subtotal applies.
    expect(quoteShop?.sale_discount_minor).toBe(6_000);
    expect(quoteShop?.discount_minor).toBe(600);
  });

  it('converts a minimum spend from its Promotion Currency and rejects a missing rate', async () => {
    await sql.query(
      `insert into "exchange_rates"
         ("id", "created_at", "updated_at", "from_currency", "to_currency", "rate",
          "effective_at", "expires_at", "source", "source_timestamp")
       values ($1, now(), now(), 'USD', 'VND', '24803.0000000000',
          now() - interval '1 day', null, 'integration-test', null)`,
      [randomUUID()],
    );

    const usdSeller = await registerSeller('promo-min-fx');
    const usdProfile = await createActiveProfile(usdSeller);
    const usdProduct = await createPublishedProduct({
      seller: usdSeller,
      shippingProfileId: usdProfile,
      title: 'Fx Minimum Bowl',
      sku: 'FX-MIN-BOWL',
      amountMinor: 500_000,
    });
    await sql.query(
      'update "variant_prices" set "currency" = $2 where "product_inventory_id" = $1',
      [usdProduct.inventoryId, 'VND'],
    );

    // 12 USD is about 297,636 VND, below the 500,000 VND cart; 120 USD is about
    // 2,976,360 VND, above it. A raw USD comparison would invert both verdicts.
    await createPromoCode(usdSeller, {
      name: 'Twelve min',
      code: 'MIN12USD',
      benefit_type: 'percentage',
      percent_off: 10,
      visibility: 'code_only',
      product_scope: 'all',
      min_order_type: 'order_total',
      min_order_value: 12,
      ...activeWindow(),
    });
    await createPromoCode(usdSeller, {
      name: 'One twenty min',
      code: 'MIN120USD',
      benefit_type: 'percentage',
      percent_off: 10,
      visibility: 'code_only',
      product_scope: 'all',
      min_order_type: 'order_total',
      min_order_value: 120,
      ...activeWindow(),
    });

    const usdBuyer = await registerBuyer('promo-min-fx');
    await addCartItem(usdBuyer, usdProduct.inventoryId, 1);

    await usdBuyer.agent
      .post(`${API_PREFIX}/cart/promo-codes/apply`)
      .set('Idempotency-Key', randomUUID())
      .send({ shop_id: usdSeller.shopPublicId, code: 'min120usd', promo_codes: [] })
      .expect(422);

    const applied = await applyPromoCode(usdBuyer, usdSeller.shopPublicId, 'min12usd');
    const quote = await createQuote(usdBuyer, [{
      shop_id: usdSeller.shopPublicId,
      promo_codes: applied.promo_codes,
    }]);
    const quoteShop = quote.shops.find((shop) => shop.shop_id === usdSeller.shopPublicId);
    expect(quoteShop?.discount_minor).toBe(50_000);

    // A minimum whose currency has no rate rejects the offer rather than
    // comparing its face value against the checkout currency.
    const eurSeller = await registerSeller('promo-min-fx-missing', 'EUR');
    const eurProfile = await createActiveProfile(eurSeller);
    const eurProduct = await createPublishedProduct({
      seller: eurSeller,
      shippingProfileId: eurProfile,
      title: 'No Rate Minimum Bowl',
      sku: 'FX-MIN-NORATE-BOWL',
      amountMinor: 500_000,
    });
    await sql.query(
      'update "variant_prices" set "currency" = $2 where "product_inventory_id" = $1',
      [eurProduct.inventoryId, 'VND'],
    );

    await createPromoCode(eurSeller, {
      name: 'Ten euro min',
      code: 'MIN10EUR',
      benefit_type: 'percentage',
      percent_off: 10,
      visibility: 'code_only',
      product_scope: 'all',
      min_order_type: 'order_total',
      min_order_value: 10,
      ...activeWindow(),
    });

    const eurBuyer = await registerBuyer('promo-min-fx-missing');
    await addCartItem(eurBuyer, eurProduct.inventoryId, 1);

    await eurBuyer.agent
      .post(`${API_PREFIX}/cart/promo-codes/apply`)
      .set('Idempotency-Key', randomUUID())
      .send({ shop_id: eurSeller.shopPublicId, code: 'min10eur', promo_codes: [] })
      .expect(422);
  });

  it('creates a shop-wide free-shipping code and waives only the owning shop Shipping Charge', async () => {
    const sellerA = await registerSeller('promo-free-a');
    const profileA = await createActiveProfile(sellerA);
    const sellerB = await registerSeller('promo-free-b');
    const profileB = await createActiveProfile(sellerB, 1_200);
    const productA = await createPublishedProduct({
      seller: sellerA,
      shippingProfileId: profileA,
      title: 'Free A',
      sku: 'FREE-A-1',
      amountMinor: 4_000,
    });
    const productB = await createPublishedProduct({
      seller: sellerB,
      shippingProfileId: profileB,
      title: 'Free B',
      sku: 'FREE-B-1',
      amountMinor: 5_000,
    });

    const promo = await createPromoCode(sellerA, {
      name: 'Free delivery A',
      code: 'FREEA',
      benefit_type: 'free_shipping',
      visibility: 'public',
      product_scope: 'all',
      min_order_type: 'none',
      ...activeWindow(),
    });
    expect(promo.benefit_type).toBe('free_shipping');
    expect(promo.product_scope).toBe('all');
    expect(promo.percent_off).toBe(0);
    expect(promo.amount_off).toBeNull();

    const buyer = await registerBuyer('promo-free');
    await addCartItem(buyer, productA.inventoryId, 1);
    await addCartItem(buyer, productB.inventoryId, 1);

    const applied = await applyPromoCode(buyer, sellerA.shopPublicId, 'freea');
    expect(applied.applied_promo_codes).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'FREEA', benefit_type: 'free_shipping' }),
    ]));

    const quote = await createQuote(buyer, [{
      shop_id: sellerA.shopPublicId,
      promo_codes: applied.promo_codes,
    }]);
    const shopA = quote.shops.find((shop) => shop.shop_id === sellerA.shopPublicId)!;
    const shopB = quote.shops.find((shop) => shop.shop_id === sellerB.shopPublicId)!;

    expect(shopA.shipping_minor).toBe(0);
    expect(shopA.shipping_discount_minor).toBe(599);
    expect(shopA.shipping_discounts).toEqual([
      expect.objectContaining({ code: 'FREEA', waived_minor: 599, benefit_type: 'free_shipping' }),
    ]);
    expect(shopA.discount_minor).toBe(0);

    // The other shop's Shipping Charge is untouched.
    expect(shopB.shipping_minor).toBe(1_200);
    expect(shopB.shipping_discount_minor).toBe(0);
    expect(quote.shipping_minor).toBe(1_200);

    const orderResponse = await submitCashOrder(buyer, quote.quote_id).expect(201);
    const orderA = (orderResponse.body.order_shops as Array<{
      id: string;
      shop: { id: string };
    }>).find((order) => order.shop.id === sellerA.shopPublicId)!;
    const orderRow = await sql.query(
      'select "shipping_minor", "shipping_quote_snapshot", "promo_codes" from "orders" where "public_id" = $1',
      [orderA.id],
    );
    expect(Number(orderRow.rows[0].shipping_minor)).toBe(0);
    expect(orderRow.rows[0].shipping_quote_snapshot.shipping_discount_minor).toBe(599);
    expect(orderRow.rows[0].promo_codes).toContain('FREEA');

    const usages = await sql.query(
      'select count(*) as count from "promotion_usages" where "promotion_id" = $1',
      [await resolvePromotionId(promo.id)],
    );
    expect(Number(usages.rows[0].count)).toBe(1);
  });

  it('rejects a free-shipping code that targets products or carries a benefit value', async () => {
    const seller = await registerSeller('promo-free-invalid');
    const base = {
      name: 'Invalid free shipping',
      visibility: 'code_only',
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(testNow.getTime() + TWO_DAYS_MS)),
    };
    const create = (body: Record<string, unknown>) =>
      seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopPublicId}/promo-codes`)
        .set('Idempotency-Key', randomUUID())
        .send(body);

    // Free shipping is shop-wide, so it cannot select Products.
    await create({
      ...base,
      code: 'FREESPEC',
      benefit_type: 'free_shipping',
      product_scope: 'specific',
      product_ids: [randomUUID()],
    }).expect(400);

    // A free-shipping code carries no percentage.
    await create({
      ...base,
      code: 'FREEPCT',
      benefit_type: 'free_shipping',
      product_scope: 'all',
      percent_off: 10,
    }).expect(400);

    // ...and no fixed amount.
    await create({
      ...base,
      code: 'FREEAMT',
      benefit_type: 'free_shipping',
      product_scope: 'all',
      amount_off: 5,
    }).expect(400);
  });

  it('stacks one free-shipping code with one product code and replaces within the shipping slot', async () => {
    const seller = await registerSeller('promo-free-stack');
    const profile = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Stack Mug',
      sku: 'STACK-MUG-1',
      amountMinor: 10_000,
    });

    await createPromoCode(seller, {
      name: 'Ten off',
      code: 'PCT10',
      benefit_type: 'percentage',
      percent_off: 10,
      visibility: 'code_only',
      product_scope: 'all',
      min_order_type: 'none',
      ...activeWindow(),
    });
    await createPromoCode(seller, {
      name: 'Free one',
      code: 'FREE1',
      benefit_type: 'free_shipping',
      visibility: 'code_only',
      product_scope: 'all',
      min_order_type: 'none',
      ...activeWindow(),
    });
    await createPromoCode(seller, {
      name: 'Free two',
      code: 'FREE2',
      benefit_type: 'free_shipping',
      visibility: 'code_only',
      product_scope: 'all',
      min_order_type: 'none',
      ...activeWindow(),
    });

    const buyer = await registerBuyer('promo-free-stack');
    await addCartItem(buyer, product.inventoryId, 1);

    const productCode = await applyPromoCode(buyer, seller.shopPublicId, 'PCT10');
    const withFree = await applyPromoCode(buyer, seller.shopPublicId, 'FREE1', productCode.promo_codes);

    // The product code and the free-shipping code occupy separate slots.
    expect(withFree.promo_codes).toEqual(expect.arrayContaining(['PCT10', 'FREE1']));
    expect(withFree.applied_promo_codes).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PCT10', benefit_type: 'percentage' }),
      expect.objectContaining({ code: 'FREE1', benefit_type: 'free_shipping' }),
    ]));

    const quote = await createQuote(buyer, [{
      shop_id: seller.shopPublicId,
      promo_codes: withFree.promo_codes,
    }]);
    const quoteShop = quote.shops.find((shop) => shop.shop_id === seller.shopPublicId)!;
    expect(quoteShop.discount_minor).toBe(1_000);
    expect(quoteShop.shipping_minor).toBe(0);
    expect(quoteShop.shipping_discount_minor).toBe(599);

    // A second free-shipping code replaces the first in the shipping slot only.
    const replaced = await applyPromoCode(buyer, seller.shopPublicId, 'FREE2', withFree.promo_codes);
    expect(replaced.promo_codes).toContain('FREE2');
    expect(replaced.promo_codes).toContain('PCT10');
    expect(replaced.promo_codes).not.toContain('FREE1');

    // An invalid replacement is rejected and leaves the selection alone.
    await buyer.agent
      .post(`${API_PREFIX}/cart/promo-codes/apply`)
      .set('Idempotency-Key', randomUUID())
      .send({ shop_id: seller.shopPublicId, code: 'NOPE', promo_codes: replaced.promo_codes })
      .expect(404);

    const retained = await applyPromoCode(buyer, seller.shopPublicId, 'FREE2', replaced.promo_codes);
    expect(retained.promo_codes).toEqual(replaced.promo_codes);
  });

  it('evaluates a free-shipping minimum on after-Sale merchandise and eligible units', async () => {
    const seller = await registerSeller('promo-free-min');
    const profile = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Minimum Mug',
      sku: 'FREE-MIN-1',
      amountMinor: 4_000,
    });

    await createSale(seller, {
      name: 'Half off',
      percent_off: 50,
      product_scope: 'all',
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(testNow.getTime() + TWO_DAYS_MS)),
    });

    await createPromoCode(seller, {
      name: 'Fifty minimum',
      code: 'MIN50FREE',
      benefit_type: 'free_shipping',
      visibility: 'public',
      product_scope: 'all',
      min_order_type: 'order_total',
      min_order_value: 50,
      ...activeWindow(),
    });
    await createPromoCode(seller, {
      name: 'Thirty minimum',
      code: 'MIN30FREE',
      benefit_type: 'free_shipping',
      visibility: 'public',
      product_scope: 'all',
      min_order_type: 'order_total',
      min_order_value: 30,
      ...activeWindow(),
    });
    await createPromoCode(seller, {
      name: 'Three units',
      code: 'QTY3FREE',
      benefit_type: 'free_shipping',
      visibility: 'public',
      product_scope: 'all',
      min_order_type: 'purchase_quantity',
      min_purchase_quantity: 3,
      ...activeWindow(),
    });

    const buyer = await registerBuyer('promo-free-min');
    // Two 40.00 units are 80.00 regular, 40.00 after the 50% Sale.
    await addCartItem(buyer, product.inventoryId, 2);

    const discoverable = await listDiscoverablePromoCodes(buyer, seller.shopPublicId);
    const find = (code: string) => discoverable.find((promoCode) => promoCode.code === code)!;

    // The 50.00 minimum is measured after the Sale: the regular 80.00 would
    // qualify, but the 40.00 eligible subtotal does not.
    expect(find('MIN50FREE')).toMatchObject({ is_eligible: false, ineligible_reason: 'min_order_value' });
    expect(find('MIN30FREE')).toMatchObject({ is_eligible: true, ineligible_reason: null });
    // Two eligible units are below the three-unit minimum.
    expect(find('QTY3FREE')).toMatchObject({ is_eligible: false, ineligible_reason: 'min_products' });

    const applied = await applyPromoCode(buyer, seller.shopPublicId, 'min30free');
    const quote = await createQuote(buyer, [{
      shop_id: seller.shopPublicId,
      promo_codes: applied.promo_codes,
    }]);
    const quoteShop = quote.shops.find((shop) => shop.shop_id === seller.shopPublicId)!;
    expect(quoteShop.sale_discount_minor).toBe(4_000);
    expect(quoteShop.shipping_minor).toBe(0);
    // Two units: 599 base + 199 additional item fee.
    expect(quoteShop.shipping_discount_minor).toBe(798);
  });

  it('treats an already-free Shipping Charge as zero benefit and consumes no redemption', async () => {
    const seller = await registerSeller('promo-free-already');
    const profile = await createActiveProfile(seller, 0);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Already Free Mug',
      sku: 'ALREADY-FREE-1',
      amountMinor: 4_000,
    });

    const promo = await createPromoCode(seller, {
      name: 'Free but already free',
      code: 'FREEZERO',
      benefit_type: 'free_shipping',
      visibility: 'code_only',
      product_scope: 'all',
      min_order_type: 'none',
      ...activeWindow(),
    });

    const buyer = await registerBuyer('promo-free-already');
    await addCartItem(buyer, product.inventoryId, 1);

    // Applying at cart level cannot yet judge shipping, so the code is kept.
    const applied = await applyPromoCode(buyer, seller.shopPublicId, 'freezero');
    expect(applied.promo_codes).toContain('FREEZERO');

    // Quoting prices shipping at zero, so the code grants nothing and is dropped.
    const quote = await createQuote(buyer, [{
      shop_id: seller.shopPublicId,
      promo_codes: applied.promo_codes,
    }]);
    const quoteShop = quote.shops.find((shop) => shop.shop_id === seller.shopPublicId)!;
    expect(quoteShop.shipping_minor).toBe(0);
    expect(quoteShop.shipping_discount_minor).toBe(0);
    expect(quoteShop.shipping_discounts).toEqual([]);
    expect(quoteShop.promo_codes).not.toContain('FREEZERO');
    expect(quote.discount_minor).toBe(0);

    const orderResponse = await submitCashOrder(buyer, quote.quote_id).expect(201);
    expect(orderResponse.body.order_shops).toHaveLength(1);

    const usages = await sql.query(
      'select count(*) as count from "promotion_usages" where "promotion_id" = $1',
      [await resolvePromotionId(promo.id)],
    );
    expect(Number(usages.rows[0].count)).toBe(0);
  });

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

  it('persists per-line promo discount and reconciles it to the committed shop discount', async () => {
    const seller = await registerSeller('promo-allocation');
    const profile = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Allocation Mug',
      sku: 'ALLOC-MUG-1',
      amountMinor: 10_000,
    });

    const sale = await createSale(seller, {
      name: 'Allocation Sale',
      percent_off: 20,
      product_scope: 'specific',
      product_ids: [product.productId],
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(testNow.getTime() + TWO_DAYS_MS)),
    });

    const productPromo = await createPromoCode(seller, {
      name: 'Allocation ten',
      code: 'ALLOC10',
      benefit_type: 'percentage',
      percent_off: 10,
      visibility: 'code_only',
      product_scope: 'specific',
      product_ids: [product.productId],
      min_order_type: 'none',
      ...activeWindow(),
    });

    const shippingPromo = await createPromoCode(seller, {
      name: 'Allocation free ship',
      code: 'ALLOCFREE',
      benefit_type: 'free_shipping',
      visibility: 'code_only',
      product_scope: 'all',
      min_order_type: 'none',
      ...activeWindow(),
    });

    const buyer = await registerBuyer('promo-allocation');
    await addCartItem(buyer, product.inventoryId, 1);

    const applied = await applyPromoCode(buyer, seller.shopPublicId, 'ALLOC10');
    const withShipping = await applyPromoCode(buyer, seller.shopPublicId, 'ALLOCFREE', applied.promo_codes);
    expect(withShipping.promo_codes).toEqual(expect.arrayContaining(['ALLOC10', 'ALLOCFREE']));

    const quote = await createQuote(buyer, [{
      shop_id: seller.shopPublicId,
      promo_codes: withShipping.promo_codes,
    }]);
    const quoteShop = quote.shops.find((shop) => shop.shop_id === seller.shopPublicId)!;

    // 100.00 regular -> 20% Sale = 80.00; 10% product code on 80.00 = 8.00 off.
    expect(quoteShop.subtotal_minor).toBe(8_000);
    expect(quoteShop.sale_discount_minor).toBe(2_000);
    expect(quoteShop.discount_minor).toBe(800);
    expect(quoteShop.shipping_minor).toBe(0);
    expect(quoteShop.shipping_discount_minor).toBe(599);
    expect(quoteShop.total_minor).toBe(7_200);

    const orderResponse = await submitCashOrder(buyer, quote.quote_id).expect(201);
    const createdOrderShop = orderResponse.body.order_shops[0] as { id: string };
    const orderShopId = await resolveOrderId(createdOrderShop.id);
    const orderPublicId = createdOrderShop.id;

    const detail = await buyer.agent
      .get(`${API_PREFIX}/me/orders/${orderPublicId}`)
      .expect(200);

    const orderShop = detail.body.order_shop as {
      discount_minor: number;
      sale_discount_minor: number;
      shipping_minor: number;
      shipping_discount_minor: number;
      total_minor: number;
      products: Array<{
        promo_discount_minor: number;
        amount_minor: number;
        original_amount_minor: number | null;
      }>;
    };

    expect(orderShop.products).toHaveLength(1);
    const [line] = orderShop.products;
    expect(line.promo_discount_minor).toBe(800);
    expect(line.amount_minor).toBe(8_000);
    expect(line.original_amount_minor).toBe(10_000);

    const productPromoSum = orderShop.products.reduce(
      (sum, p) => sum + p.promo_discount_minor,
      0,
    );
    expect(productPromoSum).toBe(orderShop.discount_minor);
    expect(orderShop.discount_minor).toBe(800);
    expect(orderShop.sale_discount_minor).toBe(2_000);
    expect(orderShop.shipping_discount_minor).toBe(599);
    expect(orderShop.shipping_minor).toBe(0);
    expect(orderShop.total_minor).toBe(7_200);

    // The seller's view of the same committed Order exposes the same facts and
    // never reconstructs them from the live Promotion either.
    const sellerDetail = await seller.agent
      .get(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${orderPublicId}`)
      .expect(200);
    const sellerOrder = sellerDetail.body.order as typeof orderShop;
    expect(sellerOrder.products[0].promo_discount_minor).toBe(line.promo_discount_minor);
    expect(sellerOrder.discount_minor).toBe(orderShop.discount_minor);
    expect(sellerOrder.sale_discount_minor).toBe(orderShop.sale_discount_minor);
    expect(sellerOrder.shipping_discount_minor).toBe(orderShop.shipping_discount_minor);
    expect(sellerOrder.shipping_minor).toBe(orderShop.shipping_minor);
    expect(sellerOrder.total_minor).toBe(orderShop.total_minor);

    // The allocation is also stored on the persisted row.
    const itemRow = await sql.query(
      'select "promo_discount_minor", "unit_price_minor", "line_total_minor" from "order_items" where "order_id" = $1',
      [orderShopId],
    );
    expect(Number(itemRow.rows[0].promo_discount_minor)).toBe(800);
    expect(Number(itemRow.rows[0].unit_price_minor)).toBe(8_000);
    expect(Number(itemRow.rows[0].line_total_minor)).toBe(8_000);

    // (b) Mutate everything that influenced the original quote and re-read the
    // SAME committed order: values must remain byte-for-byte unchanged.
    await setRegularPriceMinor(product.inventoryId, 15_000);
    await endSale(seller, sale.id).expect(201);
    await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/promo-codes/${productPromo.id}/end`)
      .set('Idempotency-Key', randomUUID())
      .expect(201);
    await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/promo-codes/${shippingPromo.id}/end`)
      .set('Idempotency-Key', randomUUID())
      .expect(201);
    // Exhaust the product code by capping its allowance at the already consumed count.
    await sql.query(
      'update "promotions" set "max_redemptions" = (select count(*) from "promotion_usages" where "promotion_id" = $1) where "id" = $1',
      [await resolvePromotionId(productPromo.id)],
    );

    const detailAfter = await buyer.agent
      .get(`${API_PREFIX}/me/orders/${orderPublicId}`)
      .expect(200);
    const orderShopAfter = detailAfter.body.order_shop as typeof orderShop;

    expect(orderShopAfter.products[0].promo_discount_minor).toBe(line.promo_discount_minor);
    expect(orderShopAfter.products[0].amount_minor).toBe(line.amount_minor);
    expect(orderShopAfter.products[0].original_amount_minor).toBe(line.original_amount_minor);
    expect(orderShopAfter.discount_minor).toBe(orderShop.discount_minor);
    expect(orderShopAfter.sale_discount_minor).toBe(orderShop.sale_discount_minor);
    expect(orderShopAfter.shipping_discount_minor).toBe(orderShop.shipping_discount_minor);
    expect(orderShopAfter.shipping_minor).toBe(orderShop.shipping_minor);
    expect(orderShopAfter.total_minor).toBe(orderShop.total_minor);

    const sellerDetailAfter = await seller.agent
      .get(`${API_PREFIX}/shops/${seller.shopPublicId}/orders/${orderPublicId}`)
      .expect(200);
    const sellerOrderAfter = sellerDetailAfter.body.order as typeof orderShop;
    expect(sellerOrderAfter.products[0].promo_discount_minor).toBe(line.promo_discount_minor);
    expect(sellerOrderAfter.discount_minor).toBe(orderShop.discount_minor);
    expect(sellerOrderAfter.sale_discount_minor).toBe(orderShop.sale_discount_minor);
    expect(sellerOrderAfter.shipping_discount_minor).toBe(orderShop.shipping_discount_minor);
    expect(sellerOrderAfter.shipping_minor).toBe(orderShop.shipping_minor);
    expect(sellerOrderAfter.total_minor).toBe(orderShop.total_minor);

    const itemRowAfter = await sql.query(
      'select "promo_discount_minor", "unit_price_minor", "line_total_minor" from "order_items" where "order_id" = $1',
      [orderShopId],
    );
    expect(itemRowAfter.rows[0]).toEqual(itemRow.rows[0]);
  });

  it('rejects a stale accepted quote when the applied promo code becomes ineligible', async () => {
    const seller = await registerSeller('promo-stale');
    const profile = await createActiveProfile(seller);
    const product = await createPublishedProduct({
      seller,
      shippingProfileId: profile,
      title: 'Stale Promo Mug',
      sku: 'STALE-PROMO-1',
      amountMinor: 10_000,
    });

    const productPromo = await createPromoCode(seller, {
      name: 'Stale ten',
      code: 'STALE10',
      benefit_type: 'percentage',
      percent_off: 10,
      visibility: 'code_only',
      product_scope: 'specific',
      product_ids: [product.productId],
      min_order_type: 'none',
      ...activeWindow(),
    });

    const buyer = await registerBuyer('promo-stale');
    await addCartItem(buyer, product.inventoryId, 1);

    const applied = await applyPromoCode(buyer, seller.shopPublicId, 'STALE10');
    const quote = await createQuote(buyer, [{
      shop_id: seller.shopPublicId,
      promo_codes: applied.promo_codes,
    }]);
    expect(quote.discount_minor).toBe(1_000);

    // The promo code becomes ineligible before the buyer commits.
    await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/promo-codes/${productPromo.id}/end`)
      .set('Idempotency-Key', randomUUID())
      .expect(201);

    const rejected = await submitCashOrder(buyer, quote.quote_id).expect(409);
    expect(rejected.body.code).toBe('CHECKOUT_QUOTE_PRICES_CHANGED');
    expect(rejected.body.refreshed_totals).toMatchObject({
      checkout_currency: 'USD',
      discount_minor: 0,
    });

    const ordersAfterRejection = await sql.query(
      'select count(*)::int as count from "orders" where "user_id" = $1',
      [buyer.userId],
    );
    expect(ordersAfterRejection.rows[0].count).toBe(0);
  });
});
