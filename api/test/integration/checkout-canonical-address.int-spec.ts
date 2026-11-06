import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EntityManager, MikroORM } from '@mikro-orm/postgresql';
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
import { seedLocations } from '../../database/seeds/location.seed';
import { seedPublishableInventory } from '../support/shipping-fixtures';

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
  agent: Agent; shopId: string; shopPublicId: string
};

type PersistedShippingAddress = {
  full_name: string;
  address1: string;
  address2?: string;
  city: string;
  country: string;
  country_code: string | null;
  state: string;
  state_code: string | null;
  zip: string;
  phone: string;
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

const DESTINATION = {
  full_name: 'Guest Buyer',
  address_1: '1 Test Street',
  city: 'Los Angeles',
  zip: '90001',
  country_code: 'US',
  state_code: 'US-CA',
  phone: '  +1 415 555 2671  ',
};

const CANONICAL_DESTINATION = {
  full_name: 'Guest Buyer',
  address1: '1 Test Street',
  city: 'Los Angeles',
  country: 'United States',
  country_code: 'US',
  state: 'California',
  state_code: 'US-CA',
  zip: '90001',
  phone: '+14155552671',
};

// eslint-disable-next-line max-lines-per-function
describe('Checkout and order snapshots carry canonical codes (integration)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: TestDatabase;
  let storageRoot: string;
  let sql: Client;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase('checkout_canonical_address');
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-checkout-codes-int-'));

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

    await seedLocations(app.get(EntityManager).fork());
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

  async function registerSeller(): Promise<TestSeller> {
    const agent = request.agent(app.getHttpServer());
    const email = `codes-seller-${Date.now()}@example.com`;

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
        shop_name: `codes-${randomUUID().slice(0, 8)}`,
        currency: 'USD',
      })
      .expect(201);

    return {
      agent,
      shopId: shopResponse.body.id as string,
      shopPublicId: shopResponse.body.id as string,
    };
  }

  async function seedPublishedProduct(
    seller: TestSeller,
    stock: number,
  ): Promise<{ inventoryId: string }> {
    const categoryResponse = await seller.agent
      .post(`${API_PREFIX}/categories`)
      .set('Idempotency-Key', randomUUID())
      .send({ name: `Codes ${randomUUID().slice(0, 8)}`, rank: 1 })
      .expect(201);

    const profileResponse = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/shipping-profiles`)
      .set('Idempotency-Key', randomUUID())
      .send({
        name: `Codes ${randomUUID().slice(0, 8)}`,
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
    const shippingProfileId = profileResponse.body.id as string;

    const productResponse = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/products`)
      .set('Idempotency-Key', randomUUID())
      .send({
        category_id: categoryResponse.body.id,
        title: 'Coded Mug',
        description: 'Canonical destination product',
        who_made: ProductWhoMade.I_DID,
        is_digital: false,
      })
      .expect(201);
    const productId = productResponse.body.id as string;

    await seller.agent
      .put(`${API_PREFIX}/shops/${seller.shopPublicId}/products/${productId}/images`)
      .attach('images', Buffer.from(`image-${productId}`), {
        filename: `${productId}.jpg`,
        contentType: 'image/jpeg',
      })
      .expect(204);

    const detail = await seller.agent
      .get(`${API_PREFIX}/shops/${seller.shopPublicId}/products/${productId}`)
      .expect(200);
    const inventoryId = detail.body.inventory[0].id as string;

    await seedPublishableInventory(sql, {
      shopId: seller.shopId,
      inventoryId,
      sku: `CODES-${randomUUID().slice(0, 8)}`,
      stock,
      amountMinor: 1000,
    });

    await seller.agent
      .put(`${API_PREFIX}/shops/${seller.shopPublicId}/products/${productId}/shipping-profile`)
      .set('Idempotency-Key', randomUUID())
      .send({ shipping_profile_id: shippingProfileId })
      .expect(204);

    await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/products/${productId}/publish`)
      .set('Idempotency-Key', randomUUID())
      .expect(201);

    return { inventoryId };
  }

  async function addGuestItem(
    agent: Agent,
    inventoryId: string,
    isTemp = false,
  ): Promise<string> {
    const response = await agent
      .post(`${API_PREFIX}/cart/items`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', randomForwardedIp())
      .send({ inventory_id: inventoryId, quantity: 1, is_temp: isTemp })
      .expect(201);

    return response.body.cart.id as string;
  }

  async function readQuote(quoteId: string): Promise<{
    shippingAddress: PersistedShippingAddress; fingerprint: string
  }> {
    const result = await sql.query(
      'select "shipping_address", "quote_fingerprint" from "checkout_quotes" where "id" = $1',
      [quoteId],
    );

    return {
      shippingAddress: result.rows[0].shipping_address as PersistedShippingAddress,
      fingerprint: result.rows[0].quote_fingerprint as string,
    };
  }

  async function readOrderShippingAddress(
    orderPublicId: string,
  ): Promise<PersistedShippingAddress> {
    const result = await sql.query(
      'select "shipping_address" from "orders" where "public_id" = $1',
      [orderPublicId],
    );

    return result.rows[0].shipping_address as PersistedShippingAddress;
  }

  it('resolves guest codes, reuses the quote across display-name changes, and snapshots the order', async () => {
    const seller = await registerSeller();
    const { inventoryId } = await seedPublishedProduct(seller, 20);

    const agent = request.agent(app.getHttpServer());
    await addGuestItem(agent, inventoryId);

    const firstQuote = await agent
      .post(`${API_PREFIX}/checkout/cart/quote`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', randomForwardedIp())
      .send({
        shipping_address: {
          ...DESTINATION,
          // Display names are deliberately wrong: codes win.
          country: 'Nowhere',
          state: 'Nowhere Province',
        },
      })
      .expect(201);

    const quoteId = firstQuote.body.quote_id as string;
    const first = await readQuote(quoteId);

    expect(first.shippingAddress).toMatchObject({
      ...CANONICAL_DESTINATION,
    });
    expect(first.shippingAddress).not.toMatchObject({
      country: 'Nowhere',
      state: 'Nowhere Province',
    });

    const reQuote = await agent
      .post(`${API_PREFIX}/checkout/cart/quote`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', randomForwardedIp())
      .send({
        shipping_address: {
          ...DESTINATION,
          country: 'Different Label',
          state: 'Different Province',
        },
      })
      .expect(201);

    expect(reQuote.body.quote_id).toBe(quoteId);
    const reused = await readQuote(reQuote.body.quote_id as string);
    expect(reused.fingerprint).toBe(first.fingerprint);

    const orderResponse = await agent
      .post(`${API_PREFIX}/checkout/cart`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', randomForwardedIp())
      .send({
        payment_type: 'cash',
        quote_id: quoteId,
        guest: { email: `guest-codes-${Date.now()}@example.com` },
      })
      .expect(201);

    const orderPublicId = orderResponse.body.order_shops[0].id as string;
    const snapshot = await readOrderShippingAddress(orderPublicId);
    expect(snapshot).toEqual(expect.objectContaining({
      ...CANONICAL_DESTINATION,
    }));
  });

  it('accepts a legacy name-only guest payload and derives the canonical codes', async () => {
    const seller = await registerSeller();
    const { inventoryId } = await seedPublishedProduct(seller, 5);

    const agent = request.agent(app.getHttpServer());
    await addGuestItem(agent, inventoryId);

    const quoteResponse = await agent
      .post(`${API_PREFIX}/checkout/cart/quote`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', randomForwardedIp())
      .send({
        shipping_address: {
          full_name: 'Guest Buyer',
          address_1: '1 Test Street',
          city: 'Los Angeles',
          zip: '90001',
          country: 'United States',
          state: 'California',
          phone: '+14155552671',
        },
      })
      .expect(201);

    const quote = await readQuote(quoteResponse.body.quote_id as string);
    expect(quote.shippingAddress).toMatchObject({
      country: 'United States',
      country_code: 'US',
      state: 'California',
      state_code: 'US-CA',
      phone: '+14155552671',
    });
  });

  it('produces the same snapshot for saved-address, guest-cart, and buy-now checkout', async () => {
    const seller = await registerSeller();
    const { inventoryId } = await seedPublishedProduct(seller, 20);

    const buyerAgent = request.agent(app.getHttpServer());
    const email = `codes-buyer-${Date.now()}@example.com`;
    await buyerAgent
      .post(`${API_PREFIX}/auth/register`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', randomForwardedIp())
      .send({ email, password: VALID_TEST_PASSWORD, displayName: 'Buyer' })
      .expect(201);

    const addressResponse = await buyerAgent
      .post(`${API_PREFIX}/me/addresses`)
      .set('Idempotency-Key', randomUUID())
      .send({
        full_name: DESTINATION.full_name,
        address_1: DESTINATION.address_1,
        city: DESTINATION.city,
        zip: DESTINATION.zip,
        country_code: DESTINATION.country_code,
        state_code: DESTINATION.state_code,
        phone: DESTINATION.phone,
        is_primary: true,
      })
      .expect(201);
    const addressId = addressResponse.body.address.id as string;

    await buyerAgent
      .post(`${API_PREFIX}/cart/items`)
      .set('Idempotency-Key', randomUUID())
      .send({ inventory_id: inventoryId, quantity: 1 })
      .expect(201);

    const savedQuoteResponse = await buyerAgent
      .post(`${API_PREFIX}/me/checkout/quote`)
      .set('Idempotency-Key', randomUUID())
      .send({ user_address_id: addressId })
      .expect(201);
    const savedQuoteId = savedQuoteResponse.body.quote_id as string;

    const cartAgent = request.agent(app.getHttpServer());
    await addGuestItem(cartAgent, inventoryId);
    const guestQuoteResponse = await cartAgent
      .post(`${API_PREFIX}/checkout/cart/quote`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', randomForwardedIp())
      .send({ shipping_address: DESTINATION })
      .expect(201);
    const guestQuoteId = guestQuoteResponse.body.quote_id as string;

    const buyNowAgent = request.agent(app.getHttpServer());
    const tempCartId = await addGuestItem(buyNowAgent, inventoryId, true);
    const buyNowQuoteResponse = await buyNowAgent
      .post(`${API_PREFIX}/checkout/buy-now/quote`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', randomForwardedIp())
      .send({ cart_id: tempCartId, shipping_address: DESTINATION })
      .expect(201);
    const buyNowQuoteId = buyNowQuoteResponse.body.quote_id as string;

    const [savedQuote, guestQuote, buyNowQuote] = await Promise.all([
      readQuote(savedQuoteId),
      readQuote(guestQuoteId),
      readQuote(buyNowQuoteId),
    ]);

    for (const quote of [savedQuote, guestQuote, buyNowQuote]) {
      expect(quote.shippingAddress).toMatchObject(CANONICAL_DESTINATION);
    }

    const savedOrder = await buyerAgent
      .post(`${API_PREFIX}/me/checkout`)
      .set('Idempotency-Key', randomUUID())
      .send({ quote_id: savedQuoteId, payment_type: 'cash' })
      .expect(201);

    const guestOrder = await cartAgent
      .post(`${API_PREFIX}/checkout/cart`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', randomForwardedIp())
      .send({
        payment_type: 'cash',
        quote_id: guestQuoteId,
        guest: { email: `guest-parity-${Date.now()}@example.com` },
      })
      .expect(201);

    const buyNowOrder = await buyNowAgent
      .post(`${API_PREFIX}/checkout/buy-now`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', randomForwardedIp())
      .send({
        payment_type: 'cash',
        quote_id: buyNowQuoteId,
        guest: { email: `guest-buy-now-${Date.now()}@example.com` },
      })
      .expect(201);

    const snapshots = await Promise.all([
      readOrderShippingAddress(savedOrder.body.order_shops[0].id as string),
      readOrderShippingAddress(guestOrder.body.order_shops[0].id as string),
      readOrderShippingAddress(buyNowOrder.body.order_shops[0].id as string),
    ]);

    expect(snapshots[0]).toEqual(expect.objectContaining(CANONICAL_DESTINATION));
    expect(snapshots[1]).toEqual(snapshots[0]);
    expect(snapshots[2]).toEqual(snapshots[0]);
  });

  it('quotes a saved address whose legacy subdivision label is not in the dataset', async () => {
    const seller = await registerSeller();
    const { inventoryId } = await seedPublishedProduct(seller, 2);

    const buyerAgent = request.agent(app.getHttpServer());
    const email = `legacy-address-${Date.now()}@example.com`;
    await buyerAgent
      .post(`${API_PREFIX}/auth/register`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', randomForwardedIp())
      .send({ email, password: VALID_TEST_PASSWORD, displayName: 'Legacy Buyer' })
      .expect(201);

    const addressResponse = await buyerAgent
      .post(`${API_PREFIX}/me/addresses`)
      .set('Idempotency-Key', randomUUID())
      .send({
        full_name: 'Legacy Buyer',
        address_1: '1 Test Street',
        city: 'Los Angeles',
        country: 'United States',
        state: 'Atlantis',
        zip: '90001',
        phone: '+14155552671',
        is_primary: true,
      })
      .expect(201);
    const addressId = addressResponse.body.address.id as string;

    await buyerAgent
      .post(`${API_PREFIX}/cart/items`)
      .set('Idempotency-Key', randomUUID())
      .send({ inventory_id: inventoryId, quantity: 1 })
      .expect(201);

    const quoteResponse = await buyerAgent
      .post(`${API_PREFIX}/me/checkout/quote`)
      .set('Idempotency-Key', randomUUID())
      .send({ user_address_id: addressId })
      .expect(201);
    const quote = await readQuote(quoteResponse.body.quote_id as string);

    expect(quote.shippingAddress).toMatchObject({
      country: 'United States',
      country_code: 'US',
      state: 'Atlantis',
      state_code: null,
    });
  });

  it('rejects a coded guest payload that breaks the saved-address subdivision rules', async () => {
    const seller = await registerSeller();
    const { inventoryId } = await seedPublishedProduct(seller, 2);

    const agent = request.agent(app.getHttpServer());
    await addGuestItem(agent, inventoryId);

    const response = await agent
      .post(`${API_PREFIX}/checkout/cart/quote`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', randomForwardedIp())
      .send({
        shipping_address: {
          ...DESTINATION,
          state_code: undefined,
          state_text: 'Somewhere',
        },
      })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'ADDRESS_STATE_TEXT_NOT_ALLOWED',
    });
  });

  it('quotes a saved address with legacy contact values without revalidating them', async () => {
    const seller = await registerSeller();
    const { inventoryId } = await seedPublishedProduct(seller, 2);

    const buyerAgent = request.agent(app.getHttpServer());
    const email = `legacy-contact-${Date.now()}@example.com`;
    await buyerAgent
      .post(`${API_PREFIX}/auth/register`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', randomForwardedIp())
      .send({ email, password: VALID_TEST_PASSWORD, displayName: 'Legacy Buyer' })
      .expect(201);

    const addressResponse = await buyerAgent
      .post(`${API_PREFIX}/me/addresses`)
      .set('Idempotency-Key', randomUUID())
      .send({
        full_name: 'Legacy Buyer',
        address_1: '1 Test Street',
        city: 'Los Angeles',
        zip: '90001',
        country_code: 'US',
        state_code: 'US-CA',
        phone: '+14155552671',
        is_primary: true,
      })
      .expect(201);
    const addressId = addressResponse.body.address.id as string;

    await sql.query(
      'update user_addresses set phone = $1, zip = $2 where id = $3',
      ['123456789', 'ABCDE', addressId],
    );

    await buyerAgent
      .post(`${API_PREFIX}/cart/items`)
      .set('Idempotency-Key', randomUUID())
      .send({ inventory_id: inventoryId, quantity: 1 })
      .expect(201);

    const quoteResponse = await buyerAgent
      .post(`${API_PREFIX}/me/checkout/quote`)
      .set('Idempotency-Key', randomUUID())
      .send({ user_address_id: addressId })
      .expect(201);
    const quote = await readQuote(quoteResponse.body.quote_id as string);

    expect(quote.shippingAddress).toMatchObject({
      country_code: 'US',
      state_code: 'US-CA',
      phone: '123456789',
      zip: 'ABCDE',
    });
  });

  it('rejects guest checkout contact values that the country rules reject', async () => {
    const seller = await registerSeller();
    const { inventoryId } = await seedPublishedProduct(seller, 2);

    const agent = request.agent(app.getHttpServer());
    await addGuestItem(agent, inventoryId);

    const invalidPhone = await agent
      .post(`${API_PREFIX}/checkout/cart/quote`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', randomForwardedIp())
      .send({ shipping_address: { ...DESTINATION, phone: '12345' } })
      .expect(400);
    expect(invalidPhone.body).toMatchObject({
      code: 'ADDRESS_PHONE_INVALID',
    });

    const invalidPostcode = await agent
      .post(`${API_PREFIX}/checkout/cart/quote`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', randomForwardedIp())
      .send({ shipping_address: { ...DESTINATION, zip: 'ABCDE' } })
      .expect(400);
    expect(invalidPostcode.body).toMatchObject({
      code: 'ADDRESS_POSTCODE_INVALID',
    });

    const requiredPostcode = await agent
      .post(`${API_PREFIX}/checkout/cart/quote`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', randomForwardedIp())
      .send({ shipping_address: { ...DESTINATION, zip: '' } })
      .expect(400);
    expect(requiredPostcode.body).toMatchObject({
      code: 'ADDRESS_POSTCODE_REQUIRED',
    });

    const gbPhone = await agent
      .post(`${API_PREFIX}/checkout/cart/quote`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', randomForwardedIp())
      .send({
        shipping_address: {
          ...DESTINATION,
          country_code: 'GB',
          state_code: 'GB-ENG',
          phone: 'not-a-phone',
        },
      })
      .expect(400);
    expect(gbPhone.body).toMatchObject({
      code: 'ADDRESS_PHONE_INVALID',
    });

    const vnPostcode = await agent
      .post(`${API_PREFIX}/checkout/cart/quote`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', randomForwardedIp())
      .send({
        shipping_address: {
          ...DESTINATION,
          country_code: 'VN',
          state_code: 'VN-24',
          zip: 'ABCDE',
          phone: '0912 345 678',
        },
      })
      .expect(400);
    expect(vnPostcode.body).toMatchObject({
      code: 'ADDRESS_POSTCODE_INVALID',
    });
  });
});
