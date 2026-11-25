import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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
import { CatalogProductProjectorService } from '~/domains/product/app/services/catalog-product-projector.service';
import { CatalogMongoAccess } from '~/domains/product/infra/catalog/mongo/access/catalog-mongo.access';
import { PermissionEntity } from '~/domains/auth/infra/persistence/entities/permission.entity';
import { RolePermissionEntity } from '~/domains/auth/infra/persistence/entities/role-permission.entity';
import { RoleEntity } from '~/domains/auth/infra/persistence/entities/role.entity';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { LocalFileStorageService } from '~/integrations/storage/infra/local-file-storage.service';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { ObservabilityService } from '~/platform/observability/observability.service';
import { RequestContextService } from '~/platform/request-context/request-context.service';
import { appJobName } from '~/platform/jobs/app-job.names';
import { createTestDatabase, dropTestDatabase } from '../support/test-postgres';
import { seedAuthReferenceData } from '../../database/seeds/auth.seed';
import {
  resolveProductId,
  resolveShopId,
  seedPublishableInventory,
} from '../support/shipping-fixtures';

jest.setTimeout(240_000);

const API_PREFIX = '/v1';
const VALID_TEST_PASSWORD = 'Password123!';

type TestDatabase = {
  dbName: string;
  rootConfig: {
    host: string; port: number; user: string; password: string;
  };
};

type TestSeller = {
  agent: Agent; email: string; shopId: string; shopPublicId: string;
};

type ShippingRateBody = {
  destination_scope: 'country' | 'everywhere_else';
  destination_country?: string;
  one_item_fee_minor: number;
  additional_item_fee_minor: number;
  delivery_time_min_days: number;
  delivery_time_max_days: number;
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

describe('Catalog shipping coverage (integration)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: TestDatabase;
  let storageRoot: string;
  let sql: Client;
  let mongo: MongoClient;
  let mongoDbName: string;
  let categoryId: string | undefined;
  let projector: CatalogProductProjectorService;
  let jobDispatcher: { dispatch: jest.Mock };

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase('catalog_shipping_coverage');
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-catalog-shipping-int-'));
    mongoDbName = `arc_catalog_shipping_${randomUUID().replace(/-/g, '')}`;

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
    process.env.CATALOG_SEARCH_DRIVER = 'mongo-basic';
    process.env.CATALOG_MONGODB_DB_NAME = mongoDbName;
    process.env.CATALOG_MONGODB_PRODUCTS_COLLECTION = 'catalog_products';
    process.env.CATALOG_MONGODB_PRICES_COLLECTION = 'catalog_product_prices';
    process.env.CATALOG_MONGODB_SLUGS_COLLECTION = 'catalog_product_slugs';
    process.env.CATALOG_MONGODB_SEARCH_COLLECTION = 'catalog_product_search';

    sql = new Client({
      host: testDb.rootConfig.host,
      port: testDb.rootConfig.port,
      user: testDb.rootConfig.user,
      password: testDb.rootConfig.password,
      database: testDb.dbName,
    });
    await sql.connect();

    mongo = new MongoClient(process.env.CATALOG_MONGODB_URI ?? 'mongodb://127.0.0.1:27017');
    await mongo.connect();

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

    // AppModule must be loaded AFTER the throwaway database and Mongo env are applied.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('~/bootstrap/app.module') as typeof BootstrapAppModule;

    jobDispatcher = { dispatch: jest.fn().mockResolvedValue(undefined) };
    const catalogMongoAccessStub = {
      getCollection: (name: string) => Promise.resolve(mongo.db(mongoDbName).collection(name)),
      ping: () => Promise.resolve(),
      onApplicationShutdown: () => Promise.resolve(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(new LocalFileStorageService({ driver: 'local', localRoot: storageRoot }))
      .overrideProvider(CatalogMongoAccess)
      .useValue(catalogMongoAccessStub)
      .overrideProvider(JobDispatcher)
      .useValue(jobDispatcher)
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

    projector = app.get(CatalogProductProjectorService);
  });

  afterAll(async () => {
    if (mongo) {
      await mongo.db(mongoDbName).dropDatabase();
      await mongo.close();
    }

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
        shop_name: `catalog${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`,
        currency: 'USD',
      })
      .expect(201);

    const shopPublicId = shopResponse.body.id as string;

    return {
      agent,
      email,
      shopId: await resolveShopId(sql, shopPublicId),
      shopPublicId,
    };
  }

  async function seedCategory(agent: Agent): Promise<string> {
    if (categoryId) {
      return categoryId;
    }

    const response = await agent
      .post(`${API_PREFIX}/categories`)
      .set('Idempotency-Key', randomUUID())
      .send({ name: 'Catalog shipping', rank: 1 })
      .expect(201);

    categoryId = response.body.id as string;

    return categoryId;
  }

  async function createActiveProfile(
    seller: TestSeller,
    name: string,
    rates: ShippingRateBody[],
  ): Promise<{ id: string; version: number }> {
    const response = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/shipping-profiles`)
      .set('Idempotency-Key', randomUUID())
      .send({
        name,
        status: 'active',
        ship_from_country: 'US',
        ship_from_postal: '10001',
        processing_time_min_days: 1,
        processing_time_max_days: 3,
        rates,
      })
      .expect(201);

    return { id: response.body.id as string, version: response.body.version as number };
  }

  async function createProduct(input: {
    seller: TestSeller;
    title: string;
    sku: string;
    isDigital?: boolean;
  }): Promise<{ productId: string; inventoryId: string }> {
    const productResponse = await input.seller.agent
      .post(`${API_PREFIX}/shops/${input.seller.shopPublicId}/products`)
      .set('Idempotency-Key', randomUUID())
      .send({
        category_id: await seedCategory(input.seller.agent),
        title: input.title,
        description: 'Catalog shipping coverage product',
        who_made: ProductWhoMade.I_DID,
        is_digital: input.isDigital ?? false,
      })
      .expect(201);
    const productId = productResponse.body.id as string;

    await input.seller.agent
      .put(`${API_PREFIX}/shops/${input.seller.shopPublicId}/products/${productId}/images`)
      .attach('images', Buffer.from(`image-${productId}`), {
        filename: `${productId}.jpg`,
        contentType: 'image/jpeg',
      })
      .expect(204);

    const detail = await input.seller.agent
      .get(`${API_PREFIX}/shops/${input.seller.shopPublicId}/products/${productId}`)
      .expect(200);
    const inventoryId = detail.body.inventory[0].id as string;

    await seedPublishableInventory(sql, {
      shopId: input.seller.shopPublicId,
      inventoryId,
      sku: input.sku,
      stock: 5,
      amountMinor: 2500,
    });

    return { productId, inventoryId };
  }

  async function assignProfile(
    seller: TestSeller,
    productId: string,
    shippingProfileId: string,
  ) {
    await seller.agent
      .put(`${API_PREFIX}/shops/${seller.shopPublicId}/products/${productId}/shipping-profile`)
      .set('Idempotency-Key', randomUUID())
      .send({ shipping_profile_id: shippingProfileId })
      .expect(204);
  }

  async function publishProduct(seller: TestSeller, productId: string) {
    await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/products/${productId}/publish`)
      .set('Idempotency-Key', randomUUID())
      .expect(201);
  }

  async function projectProduct(productId: string) {
    await projector.projectProduct(await resolveProductId(sql, productId));
  }

  function listProducts(marketCode: string) {
    return request(app.getHttpServer())
      .get(`${API_PREFIX}/products`)
      .query({ limit: 50 })
      .set('X-Market-Code', marketCode)
      .set('X-Forwarded-For', randomForwardedIp())
      .expect(200);
  }

  it('derives list availability from country, worldwide, and digital coverage', async () => {
    const seller = await createSeller('catalog-shipping');

    const countryProfile = await createActiveProfile(seller, 'US only', [{
      destination_scope: 'country',
      destination_country: 'US',
      one_item_fee_minor: 599,
      additional_item_fee_minor: 199,
      delivery_time_min_days: 3,
      delivery_time_max_days: 5,
    }]);
    const worldwideProfile = await createActiveProfile(seller, 'Worldwide', [{
      destination_scope: 'everywhere_else',
      one_item_fee_minor: 1999,
      additional_item_fee_minor: 599,
      delivery_time_min_days: 5,
      delivery_time_max_days: 10,
    }]);

    const countryProduct = await createProduct({
      seller,
      title: 'Country Only Mug',
      sku: 'COUNTRY-MUG',
    });
    const worldwideProduct = await createProduct({
      seller,
      title: 'Worldwide Mug',
      sku: 'WORLDWIDE-MUG',
    });
    const digitalProduct = await createProduct({
      seller,
      title: 'Digital Pattern',
      sku: 'DIGITAL-PATTERN',
      isDigital: true,
    });

    await assignProfile(seller, countryProduct.productId, countryProfile.id);
    await assignProfile(seller, worldwideProduct.productId, worldwideProfile.id);
    await publishProduct(seller, countryProduct.productId);
    await publishProduct(seller, worldwideProduct.productId);
    await publishProduct(seller, digitalProduct.productId);

    await projectProduct(countryProduct.productId);
    await projectProduct(worldwideProduct.productId);
    await projectProduct(digitalProduct.productId);

    const usResponse = await listProducts('US');
    const usItems = new Map(
      (usResponse.body.items as Array<{ id: string; shipping: { available: boolean } }>)
        .map((item) => [item.id, item]),
    );

    for (const productId of [
      countryProduct.productId,
      worldwideProduct.productId,
      digitalProduct.productId,
    ]) {
      expect(typeof usItems.get(productId)?.shipping.available).toBe('boolean');
      expect(usItems.get(productId)?.shipping.available).toBe(true);
    }

    const vietnamResponse = await listProducts('VN');
    const vietnamItems = new Map(
      (vietnamResponse.body.items as Array<{ id: string; shipping: { available: boolean } }>)
        .map((item) => [item.id, item]),
    );

    expect(vietnamItems.get(countryProduct.productId)?.shipping.available).toBe(false);
    expect(vietnamItems.get(worldwideProduct.productId)?.shipping.available).toBe(true);
    expect(vietnamItems.get(digitalProduct.productId)?.shipping.available).toBe(true);
  });

  it('reprojects profile edits so list availability follows the new coverage', async () => {
    const seller = await createSeller('catalog-shipping-edit');
    const profile = await createActiveProfile(seller, 'Editable', [{
      destination_scope: 'country',
      destination_country: 'US',
      one_item_fee_minor: 599,
      additional_item_fee_minor: 199,
      delivery_time_min_days: 3,
      delivery_time_max_days: 5,
    }]);
    const product = await createProduct({
      seller,
      title: 'Editable Coverage Mug',
      sku: 'EDITABLE-MUG',
    });

    await assignProfile(seller, product.productId, profile.id);
    await publishProduct(seller, product.productId);
    await projectProduct(product.productId);
    jobDispatcher.dispatch.mockClear();

    const before = await listProducts('US');
    expect(before.body.items.find((item: { id: string }) => item.id === product.productId)?.shipping.available)
      .toBe(true);

    await seller.agent
      .patch(`${API_PREFIX}/shops/${seller.shopPublicId}/shipping-profiles/${profile.id}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        version: profile.version,
        rates: [{
          destination_scope: 'country',
          destination_country: 'VN',
          one_item_fee_minor: 1999,
          additional_item_fee_minor: 599,
          delivery_time_min_days: 5,
          delivery_time_max_days: 10,
        }],
      })
      .expect(200);

    expect(jobDispatcher.dispatch).toHaveBeenCalledWith(
      appJobName.projectCatalogProduct,
      { productId: await resolveProductId(sql, product.productId) },
      expect.anything(),
    );

    await projectProduct(product.productId);

    const usAfter = await listProducts('US');
    const vnAfter = await listProducts('VN');
    expect(usAfter.body.items.find((item: { id: string }) => item.id === product.productId)?.shipping.available)
      .toBe(false);
    expect(vnAfter.body.items.find((item: { id: string }) => item.id === product.productId)?.shipping.available)
      .toBe(true);
  });

  it('reprojects assignment changes so list availability follows the new profile', async () => {
    const seller = await createSeller('catalog-shipping-assignment');
    const usProfile = await createActiveProfile(seller, 'US assignment', [{
      destination_scope: 'country',
      destination_country: 'US',
      one_item_fee_minor: 599,
      additional_item_fee_minor: 199,
      delivery_time_min_days: 3,
      delivery_time_max_days: 5,
    }]);
    const vnProfile = await createActiveProfile(seller, 'VN assignment', [{
      destination_scope: 'country',
      destination_country: 'VN',
      one_item_fee_minor: 999,
      additional_item_fee_minor: 299,
      delivery_time_min_days: 4,
      delivery_time_max_days: 7,
    }]);
    const product = await createProduct({
      seller,
      title: 'Assignment Coverage Mug',
      sku: 'ASSIGNMENT-MUG',
    });

    await assignProfile(seller, product.productId, usProfile.id);
    await publishProduct(seller, product.productId);
    await projectProduct(product.productId);

    expect((await listProducts('US')).body.items.find(
      (item: { id: string }) => item.id === product.productId,
    )?.shipping.available).toBe(true);
    expect((await listProducts('VN')).body.items.find(
      (item: { id: string }) => item.id === product.productId,
    )?.shipping.available).toBe(false);

    await assignProfile(seller, product.productId, vnProfile.id);
    await projectProduct(product.productId);

    expect((await listProducts('US')).body.items.find(
      (item: { id: string }) => item.id === product.productId,
    )?.shipping.available).toBe(false);
    expect((await listProducts('VN')).body.items.find(
      (item: { id: string }) => item.id === product.productId,
    )?.shipping.available).toBe(true);
  });
});
