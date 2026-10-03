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
import { Clock } from '~/platform/time/clock';
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
        shop_name: `promo${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`,
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
      .send({ name: 'Promo Codes', rank: 1 })
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
        description: 'Promo product',
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

  async function createQuote(
    buyer: TestBuyer,
    promoCodes: { shop_id: string; promo_codes: string[] }[] = [],
  ): Promise<{
    quote_id: string;
    subtotal_minor: number;
    discount_minor: number;
    sale_discount_minor: number;
    total_minor: number;
    shops: Array<{
      shop_id: string;
      subtotal_minor: number;
      discount_minor: number;
      sale_discount_minor: number;
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
  ): Promise<{ promo_codes: string[]; applied_coupons: Array<{ code: string; type: string }> }> {
    const response = await buyer.agent
      .post(`${API_PREFIX}/cart/coupons/apply`)
      .set('Idempotency-Key', randomUUID())
      .send({ shop_id: shopId, code, promo_codes: promoCodes })
      .expect(201);

    return response.body;
  }

  type DiscoverableCoupon = {
    code: string;
    type: string;
    applies_to: string;
    percent_off: number | null;
    amount_off: number | null;
    min_order_type: string;
    end_date: string;
    currency: string;
    is_eligible: boolean;
    ineligible_reason: string | null;
  };

  async function listDiscoverableCoupons(
    buyer: TestBuyer,
    shopId: string,
  ): Promise<DiscoverableCoupon[]> {
    const response = await buyer.agent
      .get(`${API_PREFIX}/cart/coupons`)
      .query({ shop_id: shopId })
      .expect(200);

    return response.body.coupons as DiscoverableCoupon[];
  }

  async function createSale(
    seller: TestSeller,
    body: Record<string, unknown>,
  ): Promise<{ id: string; percent_off: number }> {
    const response = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopId}/sales`)
      .set('Idempotency-Key', randomUUID())
      .send(body)
      .expect(201);

    return response.body.sale;
  }

  async function createPromoCode(
    seller: TestSeller,
    body: Record<string, unknown>,
  ): Promise<{ id: string; code: string; percent_off: number }> {
    const response = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopId}/promo-codes`)
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

    const applyResponse = await applyPromoCode(buyer, seller.shopId, 'oct10');
    expect(applyResponse.promo_codes).toContain('OCT10');
    expect(applyResponse.applied_coupons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'OCT10', type: 'percentage' }),
    ]));

    // Applying a code must not consume a redemption.
    const usagesAfterApply = await sql.query(
      'select count(*) as count from "promotion_usages"',
    );
    expect(Number(usagesAfterApply.rows[0].count)).toBe(0);

    const quote = await createQuote(buyer, [{
      shop_id: seller.shopId,
      promo_codes: applyResponse.promo_codes,
    }]);
    const quoteShop = quote.shops.find((shop) => shop.shop_id === seller.shopId);
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
    const orderShopId = orderResponse.body.order_shops[0].id as string;

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

    // Cancelled via its retained stop state (no seller endpoint for promo
    // codes yet) and globally exhausted via a committed redemption.
    const cancelledPromo = await createPromoCode(seller, {
      name: 'Cancelled ten', code: 'CANCEL10', percent_off: 10, visibility: 'public', product_scope: 'all', ...activeWindow(),
    });
    await sql.query('update "promotions" set "cancelled_at" = now() where "id" = $1', [cancelledPromo.id]);

    const exhaustedPromo = await createPromoCode(seller, {
      name: 'Exhausted ten', code: 'EXHAUST10', percent_off: 10, visibility: 'public', product_scope: 'all', ...activeWindow(),
    });
    await sql.query('update "promotions" set "max_redemptions" = 1 where "id" = $1', [exhaustedPromo.id]);
    await sql.query(
      `insert into "promotion_usages" ("id","created_at","updated_at","promotion_id","order_id","code")
       values ($1, now(), now(), $2, $3, $4)`,
      [randomUUID(), exhaustedPromo.id, randomUUID(), 'EXHAUST10'],
    );

    const buyer = await registerBuyer('promo-discovery');
    await addCartItem(buyer, product.inventoryId, 1);

    const coupons = await listDiscoverableCoupons(buyer, seller.shopId);
    const byCode = new Map(coupons.map((coupon) => [coupon.code, coupon]));

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
    expect(byCode.has('CANCEL10')).toBe(false);
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

    const coupons = await listDiscoverableCoupons(buyer, seller.shopId);
    expect(coupons.find((coupon) => coupon.code === 'EQTEN')).toMatchObject({
      is_eligible: true,
      percent_off: 10,
    });

    // Picker selection and manual entry both resolve through the apply rule.
    const manual = await applyPromoCode(buyer, seller.shopId, 'eqten');
    expect(manual.applied_coupons).toEqual([{ code: 'EQTEN', type: 'percentage' }]);

    // An eligible replacement replaces the product-discount slot code.
    const replaced = await applyPromoCode(buyer, seller.shopId, 'eqtwenty', manual.promo_codes);
    expect(replaced.promo_codes).toEqual(['EQTWENTY']);

    // An invalid replacement is rejected and leaves the previous selection intact.
    await buyer.agent
      .post(`${API_PREFIX}/cart/coupons/apply`)
      .set('Idempotency-Key', randomUUID())
      .send({ shop_id: seller.shopId, code: 'eqshirt', promo_codes: replaced.promo_codes })
      .expect(422);

    const quote = await createQuote(buyer, [{
      shop_id: seller.shopId,
      promo_codes: replaced.promo_codes,
    }]);
    const quoteShop = quote.shops.find((shop) => shop.shop_id === seller.shopId);
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

    const coupons = await listDiscoverableCoupons(buyer, seller.shopId);
    expect(coupons.find((coupon) => coupon.code === 'ONEPCT')).toMatchObject({
      is_eligible: false,
      ineligible_reason: 'zero_benefit',
    });

    await buyer.agent
      .post(`${API_PREFIX}/cart/coupons/apply`)
      .set('Idempotency-Key', randomUUID())
      .send({ shop_id: seller.shopId, code: 'onepct', promo_codes: [] })
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
    await sql.query('update "promotions" set "max_redemptions" = 1 where "id" = $1', [promo.id]);

    const buyer = await registerBuyer('promo-recheck');
    await addCartItem(buyer, product.inventoryId, 1);

    const applied = await applyPromoCode(buyer, seller.shopId, 'limited10');
    const quote = await createQuote(buyer, [{
      shop_id: seller.shopId,
      promo_codes: applied.promo_codes,
    }]);
    const quoteShop = quote.shops.find((shop) => shop.shop_id === seller.shopId);
    expect(quoteShop?.discount_minor).toBe(1000);

    // Another buyer takes the last redemption between quote and commitment.
    await sql.query(
      `insert into "promotion_usages" ("id","created_at","updated_at","promotion_id","order_id","code")
       values ($1, now(), now(), $2, $3, $4)`,
      [randomUUID(), promo.id, randomUUID(), 'LIMITED10'],
    );

    await submitCashOrder(buyer, quote.quote_id).expect(409);

    const orders = await sql.query(
      'select count(*) as count from "orders" where "user_id" = $1',
      [buyer.userId],
    );
    expect(Number(orders.rows[0].count)).toBe(0);

    const usages = await sql.query(
      'select count(*) as count from "promotion_usages" where "promotion_id" = $1',
      [promo.id],
    );
    expect(Number(usages.rows[0].count)).toBe(1);
  });
});
