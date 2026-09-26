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

type TestDatabase = {
  dbName: string;
  rootConfig: {
    host: string; port: number; user: string; password: string 
  };
};

type TestSeller = { agent: Agent; email: string; shopId: string };

type ShippingProfileResource = {
  id: string;
  shop_id: string;
  name: string;
  status: string;
  version: number;
  currency: string;
  ship_from_country?: string;
  ship_from_postal?: string;
  checkout_ready: boolean;
  readiness_issues: string[];
  is_default: boolean;
  assigned_product_count: number;
  published_product_count: number;
  processing_time_min_days?: number;
  processing_time_max_days?: number;
  rates: Array<{
    id: string;
    position: number;
    destination_scope: string;
    destination_country?: string;
    one_item_fee_minor: number;
    additional_item_fee_minor: number;
    delivery_time_min_days?: number;
    delivery_time_max_days?: number;
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
describe('Reusable shipping profiles (integration)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: TestDatabase;
  let storageRoot: string;
  let sql: Client;
  let categoryId: string | undefined;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase('shipping_profile');
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-shipping-profile-int-'));

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
        shop_name: `ship${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`,
        currency: 'USD',
      })
      .expect(201);

    return { agent, email, shopId: shopResponse.body.id as string };
  }

  async function seedCategory(agent: Agent): Promise<string> {
    if (categoryId) {
      return categoryId;
    }

    const response = await agent
      .post(`${API_PREFIX}/categories`)
      .set('Idempotency-Key', randomUUID())
      .send({ name: 'Shipping', rank: 1 })
      .expect(201);

    categoryId = response.body.id as string;

    return categoryId;
  }

  function createActiveProfileBody(name: string) {
    return {
      name,
      status: 'active',
      ship_from_country: 'US',
      ship_from_postal: '10001',
      processing_time_min_days: 1,
      processing_time_max_days: 3,
      rates: [
        {
          destination_scope: 'everywhere_else',
          one_item_fee_minor: 1999,
          additional_item_fee_minor: 599,
          delivery_time_min_days: 5,
          delivery_time_max_days: 10,
        },
        {
          destination_scope: 'country',
          destination_country: 'US',
          one_item_fee_minor: 599,
          additional_item_fee_minor: 199,
          delivery_time_min_days: 3,
          delivery_time_max_days: 5,
        },
      ],
    };
  }

  async function createActiveProfile(
    seller: TestSeller,
    name: string,
  ): Promise<ShippingProfileResource> {
    const response = await seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
      .set('Idempotency-Key', randomUUID())
      .send(createActiveProfileBody(name))
      .expect(201);

    return response.body as ShippingProfileResource;
  }

  async function createProduct(input: {
    seller: TestSeller;
    title: string;
    sku: string;
    isDigital?: boolean;
  }): Promise<{ productId: string; inventoryId: string }> {
    const productResponse = await input.seller.agent
      .post(`${API_PREFIX}/shops/${input.seller.shopId}/products`)
      .set('Idempotency-Key', randomUUID())
      .send({
        category_id: await seedCategory(input.seller.agent),
        title: input.title,
        description: 'Shipping profile test product',
        who_made: ProductWhoMade.I_DID,
        is_digital: input.isDigital ?? false,
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
      stock: 5,
      amountMinor: 2500,
    });

    return { productId, inventoryId };
  }

  async function assignProfile(
    seller: TestSeller,
    productId: string,
    shippingProfileId: string | null,
  ) {
    const response = await seller.agent
      .put(`${API_PREFIX}/shops/${seller.shopId}/products/${productId}/shipping-profile`)
      .set('Idempotency-Key', randomUUID())
      .send({ shipping_profile_id: shippingProfileId });

    if (response.status !== 204) {
       
      console.log('ASSIGN_FAILED', response.status, JSON.stringify(response.body));
    }

    return response;
  }

  describe('schema cutover', () => {
    it('keeps the reusable profile schema and removes the legacy per-product configuration', async () => {
      const tables = await sql.query<{ table_name: string }>(`
        select "table_name" from "information_schema"."tables"
        where "table_schema" = 'public'
          and "table_name" in (
            'shipping_profiles',
            'shipping_profile_rates',
            'product_shipping_profiles',
            'product_shipping_destinations'
          )
      `);

      expect(tables.rows.map(row => row.table_name).sort()).toEqual([
        'shipping_profile_rates',
        'shipping_profiles',
      ]);

      const columns = await sql.query<{ column_name: string }>(`
        select "column_name" from "information_schema"."columns"
        where "table_schema" = 'public' and "table_name" = 'products'
          and "column_name" = 'shipping_profile_id'
      `);

      expect(columns.rows).toHaveLength(1);
    });

    it('rejects a partial duration pair at the database check constraint', async () => {
      const seller = await createSeller('shipping-check-constraint');
      const profile = await createActiveProfile(seller, 'Constraint profile');

      // The constraint's populated branch must require both bounds, so a
      // half-filled pair cannot slip past as SQL UNKNOWN.
      await expect(sql.query(
        'update "shipping_profiles" set "processing_time_min_days" = 3, "processing_time_max_days" = null where "id" = $1',
        [profile.id],
      )).rejects.toThrow(/shipping_profiles_processing_time_range_check/);

      await expect(sql.query(
        'update "shipping_profiles" set "processing_time_min_days" = null, "processing_time_max_days" = 4 where "id" = $1',
        [profile.id],
      )).rejects.toThrow(/shipping_profiles_processing_time_range_check/);

      const rateId = profile.rates[0].id;

      await expect(sql.query(
        'update "shipping_profile_rates" set "delivery_time_min_days" = 5, "delivery_time_max_days" = null where "id" = $1',
        [rateId],
      )).rejects.toThrow(/shipping_profile_rates_delivery_time_range_check/);

      await expect(sql.query(
        'update "shipping_profile_rates" set "delivery_time_min_days" = null, "delivery_time_max_days" = 6 where "id" = $1',
        [rateId],
      )).rejects.toThrow(/shipping_profile_rates_delivery_time_range_check/);

      // A complete valid pair still writes, proving the constraint is not
      // rejecting populated ranges outright.
      await sql.query(
        'update "shipping_profiles" set "processing_time_min_days" = 0, "processing_time_max_days" = 0 where "id" = $1',
        [profile.id],
      );
    });
  });

  describe('profile lifecycle and authorization', () => {
    it('creates, reads, edits, and archives a shop-owned profile', async () => {
      const seller = await createSeller('shipping-lifecycle');
      const created = await createActiveProfile(seller, 'Standard shipping');

      expect(created).toMatchObject({
        shop_id: seller.shopId,
        name: 'Standard shipping',
        status: 'active',
        version: 1,
        currency: 'USD',
        ship_from_country: 'US',
        ship_from_postal: '10001',
        checkout_ready: true,
        readiness_issues: [],
        assigned_product_count: 0,
        published_product_count: 0,
      });
      expect(created.rates.map(rate => rate.destination_scope).sort()).toEqual([
        'country',
        'everywhere_else',
      ]);

      const read = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${created.id}`)
        .expect(200);

      expect(read.body.id).toBe(created.id);

      const updated = await seller.agent
        .patch(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${created.id}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          version: created.version,
          name: 'Standard shipping (edited)',
          rates: [
            {
              destination_scope: 'country',
              destination_country: 'US',
              one_item_fee_minor: 700,
              additional_item_fee_minor: 250,
              delivery_time_min_days: 4,
              delivery_time_max_days: 6,
            },
          ],
        })
        .expect(200);

      expect(updated.body).toMatchObject({
        name: 'Standard shipping (edited)',
        version: 2,
        checkout_ready: true,
      });
      expect(updated.body.rates).toHaveLength(1);
      expect(updated.body.rates[0]).toMatchObject({
        destination_scope: 'country',
        destination_country: 'US',
        one_item_fee_minor: 700,
        additional_item_fee_minor: 250,
        delivery_time_min_days: 4,
        delivery_time_max_days: 6,
      });

      const archived = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${created.id}/archive`)
        .set('Idempotency-Key', randomUUID())
        .expect(200);

      expect(archived.body).toMatchObject({
        status: 'archived',
        checkout_ready: false,
      });
      expect(archived.body.readiness_issues).toContain('archived');
    });

    it('rejects a name another profile in the shop already uses, ignoring case and padding', async () => {
      const seller = await createSeller('shipping-name');
      await createActiveProfile(seller, 'Standard shipping');

      const conflict = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
        .set('Idempotency-Key', randomUUID())
        .send({ name: '  standard SHIPPING  ', status: 'draft' })
        .expect(409);

      expect(conflict.body.code).toBe('ShippingProfileNameTakenError');
    });

    it('rejects an active profile without rates', async () => {
      const seller = await createSeller('shipping-validation');

      const response = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Incomplete', status: 'active' })
        .expect(422);

      expect(response.body.code).toBe('InvalidShippingProfileError');
    });

    it('rejects an independent profile or rate currency', async () => {
      const seller = await createSeller('shipping-currency-input');

      const rejectedProfileCurrency = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
        .set('Idempotency-Key', randomUUID())
        .send({
          name: 'Profile currency',
          currency: 'EUR',
          rates: [
            {
              destination_scope: 'everywhere_else',
              one_item_fee_minor: 100,
              additional_item_fee_minor: 50,
            },
          ],
        })
        .expect(400);

      expect(rejectedProfileCurrency.body.message).toEqual(
        expect.arrayContaining([expect.stringMatching(/currency/i)]),
      );

      const rejectedRateCurrency = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
        .set('Idempotency-Key', randomUUID())
        .send({
          name: 'Rate currency',
          rates: [
            {
              destination_scope: 'everywhere_else',
              one_item_fee_minor: 100,
              additional_item_fee_minor: 50,
              currency: 'EUR',
            },
          ],
        })
        .expect(400);

      expect(rejectedRateCurrency.body.message).toEqual(
        expect.arrayContaining([expect.stringMatching(/currency/i)]),
      );
    });

    it('keeps a draft profile usable for editing but not for checkout', async () => {
      const seller = await createSeller('shipping-draft');

      const response = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Freight shipping' })
        .expect(201);

      expect(response.body).toMatchObject({
        status: 'draft',
        checkout_ready: false,
      });
      expect(response.body.readiness_issues).toEqual(
        expect.arrayContaining(['draft', 'missing_rates']),
      );
    });

    it('reports a stale write instead of overwriting a concurrent edit', async () => {
      const seller = await createSeller('shipping-version');
      const created = await createActiveProfile(seller, 'Standard shipping');

      await seller.agent
        .patch(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${created.id}`)
        .set('Idempotency-Key', randomUUID())
        .send({ version: created.version, name: 'Renamed once' })
        .expect(200);

      const conflict = await seller.agent
        .patch(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${created.id}`)
        .set('Idempotency-Key', randomUUID())
        .send({ version: created.version, name: 'Renamed twice' })
        .expect(409);

      expect(conflict.body.code).toBe('ShippingProfileVersionConflictError');
      expect(conflict.body.version).toBe(2);
    });

    it('scopes every profile endpoint to the owning seller', async () => {
      const owner = await createSeller('shipping-owner');
      const stranger = await createSeller('shipping-stranger');
      const created = await createActiveProfile(owner, 'Standard shipping');

      await stranger.agent
        .get(`${API_PREFIX}/shops/${owner.shopId}/shipping-profiles`)
        .expect(403);
      await stranger.agent
        .get(`${API_PREFIX}/shops/${owner.shopId}/shipping-profiles/${created.id}`)
        .expect(403);
      await stranger.agent
        .post(`${API_PREFIX}/shops/${owner.shopId}/shipping-profiles`)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Stolen' })
        .expect(403);
      await stranger.agent
        .patch(`${API_PREFIX}/shops/${owner.shopId}/shipping-profiles/${created.id}`)
        .set('Idempotency-Key', randomUUID())
        .send({ version: 1, name: 'Stolen' })
        .expect(403);
      await stranger.agent
        .post(`${API_PREFIX}/shops/${owner.shopId}/shipping-profiles/${created.id}/archive`)
        .set('Idempotency-Key', randomUUID())
        .expect(403);

      const list = await owner.agent
        .get(`${API_PREFIX}/shops/${owner.shopId}/shipping-profiles`)
        .expect(200);

      expect(list.body.results).toHaveLength(1);
      expect(list.body.results[0].name).toBe('Standard shipping');

      const anonymous = request(app.getHttpServer());
      await anonymous
        .get(`${API_PREFIX}/shops/${owner.shopId}/shipping-profiles`)
        .expect(401);
    });

    it('pages the shop profile list and reports its totals', async () => {
      const seller = await createSeller('shipping-pagination');
      await createActiveProfile(seller, 'First profile');
      await createActiveProfile(seller, 'Second profile');
      const third = await createActiveProfile(seller, 'Third profile');

      const firstPage = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles?page=1&limit=2`)
        .expect(200);

      expect(firstPage.body).toMatchObject({
        page: 1,
        limit: 2,
        total_pages: 2,
        total_results: 3,
      });
      expect(firstPage.body.results).toHaveLength(2);

      const secondPage = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles?page=2&limit=2`)
        .expect(200);

      expect(secondPage.body.results).toHaveLength(1);
      expect(secondPage.body.results[0].id).toBe(third.id);
      expect(secondPage.body.results.map((profile: { id: string }) => profile.id))
        .not.toContain(firstPage.body.results[0].id);

      // The default page returns the whole shop when it fits.
      const defaults = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
        .expect(200);

      expect(defaults.body).toMatchObject({
        page: 1,
        limit: 20,
        total_pages: 1,
        total_results: 3,
      });
      expect(defaults.body.results).toHaveLength(3);

      // A page beyond the last one is empty rather than an error.
      const beyondLastPage = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles?page=4&limit=2`)
        .expect(200);

      expect(beyondLastPage.body.results).toHaveLength(0);
      expect(beyondLastPage.body.total_results).toBe(3);

      await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles?limit=101`)
        .expect(400);
      await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles?page=0`)
        .expect(400);
    });

    it('hides archived profiles from the working list and reports the count of every state', async () => {
      const seller = await createSeller('shipping-list-archived');
      const live = await createActiveProfile(seller, 'Live profile');
      await createActiveProfile(seller, 'Second live profile');
      await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Unfinished profile' })
        .expect(201);

      const retired = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Retired profile' })
        .expect(201);

      await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${retired.body.id}/archive`)
        .set('Idempotency-Key', randomUUID())
        .expect(200);

      // The working list is the actionable set: archived profiles are retained
      // but only listed when the caller asks for them.
      const defaults = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
        .expect(200);
      const defaultIds = defaults.body.results.map((profile: { id: string }) => profile.id);

      expect(defaults.body).toMatchObject({
        total_results: 3,
        status_counts: { active: 2, draft: 1, archived: 1 },
      });
      expect(defaultIds).toContain(live.id);
      expect(defaultIds).not.toContain(retired.body.id);

      const archived = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles?status=archived`)
        .expect(200);

      expect(archived.body).toMatchObject({
        total_results: 1,
        status_counts: { active: 2, draft: 1, archived: 1 },
      });
      expect(archived.body.results.map((profile: { id: string }) => profile.id))
        .toEqual([retired.body.id]);

      // Repeated and comma-separated filters select the same states.
      const repeated = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles?status=active&status=draft`)
        .expect(200);
      const commaSeparated = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles?status=active,draft`)
        .expect(200);

      expect(repeated.body.total_results).toBe(3);
      expect(commaSeparated.body.total_results).toBe(3);

      await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles?status=retired`)
        .expect(400);
    });
  });

  describe('duration ranges and seller estimates', () => {
    it('persists the profile processing range and each rate delivery range', async () => {
      const seller = await createSeller('shipping-durations');
      const created = await createActiveProfile(seller, 'Standard shipping');

      expect(created).toMatchObject({
        processing_time_min_days: 1,
        processing_time_max_days: 3,
        checkout_ready: true,
        readiness_issues: [],
      });
      expect(created.rates.map(rate => ({
        scope: rate.destination_scope,
        delivery_min: rate.delivery_time_min_days,
        delivery_max: rate.delivery_time_max_days,
      }))).toEqual([
        { scope: 'everywhere_else', delivery_min: 5, delivery_max: 10 },
        { scope: 'country', delivery_min: 3, delivery_max: 5 },
      ]);

      const read = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${created.id}`)
        .expect(200);

      expect(read.body).toMatchObject({
        processing_time_min_days: 1,
        processing_time_max_days: 3,
      });

      const list = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
        .expect(200);

      expect(list.body.results[0]).toMatchObject({
        processing_time_min_days: 1,
        processing_time_max_days: 3,
      });
    });

    it('allows zero-day ranges', async () => {
      const seller = await createSeller('shipping-zero-days');

      const response = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
        .set('Idempotency-Key', randomUUID())
        .send({
          name: 'Same-day dispatch',
          status: 'active',
          processing_time_min_days: 0,
          processing_time_max_days: 0,
          rates: [
            {
              destination_scope: 'everywhere_else',
              one_item_fee_minor: 0,
              additional_item_fee_minor: 0,
              delivery_time_min_days: 0,
              delivery_time_max_days: 0,
            },
          ],
        })
        .expect(201);

      expect(response.body).toMatchObject({
        processing_time_min_days: 0,
        processing_time_max_days: 0,
        checkout_ready: true,
      });
      expect(response.body.rates[0]).toMatchObject({
        delivery_time_min_days: 0,
        delivery_time_max_days: 0,
      });
    });

    it('rejects invalid or partial duration ranges', async () => {
      const seller = await createSeller('shipping-duration-validation');
      const post = (body: Record<string, unknown>) =>
        seller.agent
          .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
          .set('Idempotency-Key', randomUUID())
          .send(body);
      const validRate = {
        destination_scope: 'everywhere_else',
        one_item_fee_minor: 0,
        additional_item_fee_minor: 0,
        delivery_time_min_days: 1,
        delivery_time_max_days: 2,
      };

      // Transport validation rejects non-integer and negative values outright.
      await post({
        name: 'Negative',
        processing_time_min_days: -1,
        processing_time_max_days: 2,
        rates: [validRate],
      }).expect(400);

      await post({
        name: 'Fractional',
        processing_time_min_days: 1.5,
        processing_time_max_days: 2,
        rates: [validRate],
      }).expect(400);

      const inverted = await post({
        name: 'Inverted',
        processing_time_min_days: 5,
        processing_time_max_days: 2,
        rates: [validRate],
      }).expect(422);
      expect(inverted.body.message).toMatch(/processing time/i);

      const partialProcessing = await post({
        name: 'Partial processing',
        processing_time_min_days: 1,
        rates: [validRate],
      }).expect(422);
      expect(partialProcessing.body.message).toMatch(/processing time/i);

      const invertedDelivery = await post({
        name: 'Inverted delivery',
        processing_time_min_days: 1,
        processing_time_max_days: 2,
        rates: [{
          destination_scope: 'everywhere_else',
          one_item_fee_minor: 0,
          additional_item_fee_minor: 0,
          delivery_time_min_days: 9,
          delivery_time_max_days: 3,
        }],
      }).expect(422);
      expect(invertedDelivery.body.message).toMatch(/delivery time/i);

      const partialDelivery = await post({
        name: 'Partial delivery',
        processing_time_min_days: 1,
        processing_time_max_days: 2,
        rates: [{
          destination_scope: 'everywhere_else',
          one_item_fee_minor: 0,
          additional_item_fee_minor: 0,
          delivery_time_max_days: 3,
        }],
      }).expect(422);
      expect(partialDelivery.body.message).toMatch(/delivery time/i);

      await post({
        name: 'Negative delivery',
        processing_time_min_days: 1,
        processing_time_max_days: 2,
        rates: [{
          destination_scope: 'everywhere_else',
          one_item_fee_minor: 0,
          additional_item_fee_minor: 0,
          delivery_time_min_days: -2,
          delivery_time_max_days: 3,
        }],
      }).expect(400);
    });

    it('refuses to activate a profile whose ranges are incomplete', async () => {
      const seller = await createSeller('shipping-duration-activation');

      const missingProcessing = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
        .set('Idempotency-Key', randomUUID())
        .send({
          name: 'No processing range',
          status: 'active',
          rates: [{
            destination_scope: 'everywhere_else',
            one_item_fee_minor: 0,
            additional_item_fee_minor: 0,
            delivery_time_min_days: 1,
            delivery_time_max_days: 2,
          }],
        })
        .expect(422);
      expect(missingProcessing.body.message).toMatch(/processing time/i);

      const missingDelivery = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
        .set('Idempotency-Key', randomUUID())
        .send({
          name: 'No delivery range',
          status: 'active',
          processing_time_min_days: 1,
          processing_time_max_days: 2,
          rates: [{
            destination_scope: 'everywhere_else',
            one_item_fee_minor: 0,
            additional_item_fee_minor: 0,
          }],
        })
        .expect(422);
      expect(missingDelivery.body.message).toMatch(/delivery time/i);

      // A draft may be saved incomplete so a seller can finish it later.
      const draft = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Work in progress' })
        .expect(201);

      expect(draft.body).toMatchObject({ status: 'draft', checkout_ready: false });
      expect(draft.body.readiness_issues).toEqual(
        expect.arrayContaining([
          'draft',
          'missing_rates',
          'missing_processing_time',
        ]),
      );
    });

    it('accepts large valid duration ranges without an undocumented ceiling', async () => {
      const seller = await createSeller('shipping-large-durations');

      const response = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
        .set('Idempotency-Key', randomUUID())
        .send({
          name: 'Oversized ranges',
          status: 'active',
          processing_time_min_days: 30,
          processing_time_max_days: 400,
          rates: [
            {
              destination_scope: 'everywhere_else',
              one_item_fee_minor: 0,
              additional_item_fee_minor: 0,
              delivery_time_min_days: 200,
              delivery_time_max_days: 900,
            },
          ],
        })
        .expect(201);

      expect(response.body).toMatchObject({
        processing_time_min_days: 30,
        processing_time_max_days: 400,
        checkout_ready: true,
        readiness_issues: [],
      });
      expect(response.body.rates[0]).toMatchObject({
        delivery_time_min_days: 200,
        delivery_time_max_days: 900,
      });

      const preview = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${response.body.id}/preview`)
        .send({ country_code: 'US', quantity: 1 })
        .expect(200);

      expect(preview.body.estimate).toMatchObject({
        combined_min_days: 230,
        combined_max_days: 1300,
      });
    });

    it('reports profiles without authoritative ranges as incomplete instead of assuming zero days', async () => {
      const seller = await createSeller('shipping-duration-migration');
      const created = await createActiveProfile(seller, 'Legacy profile');

      // Simulate a profile that predates the duration scope: same shape, no
      // numeric ranges and no parsed free-text evidence.
      await sql.query(
        'update "shipping_profiles" set "processing_time_min_days" = null, "processing_time_max_days" = null where "id" = $1',
        [created.id],
      );
      await sql.query(
        'update "shipping_profile_rates" set "delivery_time_min_days" = null, "delivery_time_max_days" = null where "shipping_profile_id" = $1',
        [created.id],
      );

      const read = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${created.id}`)
        .expect(200);

      expect(read.body).toMatchObject({ checkout_ready: false });
      expect(read.body.readiness_issues).toEqual(
        expect.arrayContaining(['missing_processing_time', 'missing_delivery_time']),
      );
      expect(read.body.processing_time_min_days).toBeUndefined();
      expect(read.body.processing_time_max_days).toBeUndefined();
      expect(read.body.rates.every((rate: { delivery_time_min_days?: number }) => rate.delivery_time_min_days === undefined)).toBe(true);

      const preview = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${created.id}/preview`)
        .send({ country_code: 'US', quantity: 1 })
        .expect(200);

      expect(preview.body).toMatchObject({ matched: true, checkout_ready: false });
      expect(preview.body.estimate).toBeUndefined();
      expect(preview.body.processing_time).toBeUndefined();
    });
  });

  describe('destination pricing preview', () => {
    it('prefers the configured country over everywhere else', async () => {
      const seller = await createSeller('shipping-preview');
      const profile = await createActiveProfile(seller, 'Standard shipping');

      const country = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${profile.id}/preview`)
        .send({ country_code: 'us', quantity: 3 })
        .expect(200);

      expect(country.body).toMatchObject({
        matched: true,
        checkout_ready: true,
        currency: 'USD',
        quantity: 3,
        base_item_total_minor: 599,
        additional_items_quantity: 2,
        additional_items_total_minor: 398,
        total_minor: 997,
      });
      expect(country.body.rate.destination_scope).toBe('country');

      const everywhereElse = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${profile.id}/preview`)
        .send({ country_code: 'DE', quantity: 2 })
        .expect(200);

      expect(everywhereElse.body).toMatchObject({
        matched: true,
        base_item_total_minor: 1999,
        additional_items_total_minor: 599,
        total_minor: 2598,
      });
      expect(everywhereElse.body.rate.destination_scope).toBe('everywhere_else');
    });

    it('returns the matched rate with the processing, delivery, and combined estimate', async () => {
      const seller = await createSeller('shipping-preview-estimate');
      const profile = await createActiveProfile(seller, 'Standard shipping');

      const previewedAt = new Date();
      const response = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${profile.id}/preview`)
        .send({ country_code: 'US', quantity: 2 })
        .expect(200);

      expect(response.body).toMatchObject({
        matched: true,
        checkout_ready: true,
        quantity: 2,
        base_item_total_minor: 599,
        additional_items_total_minor: 199,
        total_minor: 798,
      });
      expect(response.body.rate.destination_scope).toBe('country');
      expect(response.body.processing_time).toEqual({ min_days: 1, max_days: 3 });
      expect(response.body.delivery_time).toEqual({ min_days: 3, max_days: 5 });
      expect(response.body.estimate).toMatchObject({
        combined_min_days: 4,
        combined_max_days: 8,
      });

      const anchor = new Date(response.body.estimate.anchor_at);
      const expectedAnchorDay = Date.UTC(
        anchor.getUTCFullYear(),
        anchor.getUTCMonth(),
        anchor.getUTCDate(),
      );
      expect(anchor.getTime()).toBeGreaterThanOrEqual(previewedAt.getTime() - 1000);
      expect(anchor.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
      expect(new Date(response.body.estimate.earliest_delivery_date).getTime())
        .toBe(expectedAnchorDay + (4 * 24 * 60 * 60 * 1000));
      expect(new Date(response.body.estimate.latest_delivery_date).getTime())
        .toBe(expectedAnchorDay + (8 * 24 * 60 * 60 * 1000));
    });

    it('uses the matched destination delivery range for the estimate', async () => {
      const seller = await createSeller('shipping-preview-destination-estimate');
      const profile = await createActiveProfile(seller, 'Standard shipping');
      const preview = (body: Record<string, unknown>) =>
        seller.agent
          .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${profile.id}/preview`)
          .send(body);

      const unitedStates = await preview({ country_code: 'US', quantity: 1 }).expect(200);
      expect(unitedStates.body.rate.destination_scope).toBe('country');
      expect(unitedStates.body.delivery_time).toEqual({ min_days: 3, max_days: 5 });
      expect(unitedStates.body.estimate).toMatchObject({ combined_min_days: 4, combined_max_days: 8 });

      const germany = await preview({ country_code: 'DE', quantity: 1 }).expect(200);
      expect(germany.body.rate.destination_scope).toBe('everywhere_else');
      expect(germany.body.delivery_time).toEqual({ min_days: 5, max_days: 10 });
      expect(germany.body.estimate).toMatchObject({ combined_min_days: 6, combined_max_days: 13 });
    });

    it('reports an unsupported destination without inventing a fee', async () => {
      const seller = await createSeller('shipping-unsupported');
      const created = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
        .set('Idempotency-Key', randomUUID())
        .send({
          name: 'US only',
          status: 'active',
          processing_time_min_days: 1,
          processing_time_max_days: 2,
          rates: [
            {
              destination_scope: 'country',
              destination_country: 'US',
              one_item_fee_minor: 599,
              additional_item_fee_minor: 199,
              delivery_time_min_days: 2,
              delivery_time_max_days: 6,
            },
          ],
        })
        .expect(201);

      const response = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${created.body.id}/preview`)
        .send({ country_code: 'DE', quantity: 1 })
        .expect(200);

      expect(response.body.matched).toBe(false);
      expect(response.body.total_minor).toBeUndefined();
      expect(response.body.rate).toBeUndefined();
    });

    it('denominates rate amounts in the shop currency and never reinterprets stored amounts after a currency change', async () => {
      const seller = await createSeller('shipping-currency');
      const profile = await createActiveProfile(seller, 'Shop currency shipping');

      expect(profile.currency).toBe('USD');

      await sql.query('update "shops" set "currency" = $2, "updated_at" = now() where "id" = $1', [
        seller.shopId,
        'EUR',
      ]);

      const preview = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${profile.id}/preview`)
        .send({ country_code: 'US', quantity: 1 })
        .expect(200);

      // The label follows the shop; the stored minor-unit amounts are unchanged.
      expect(preview.body).toMatchObject({ currency: 'EUR', total_minor: 599 });
      expect(preview.body.rate.one_item_fee_minor).toBe(599);

      const read = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${profile.id}`)
        .expect(200);

      expect(read.body.currency).toBe('EUR');
      expect(read.body.rates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ one_item_fee_minor: 599, additional_item_fee_minor: 199 }),
        ]),
      );
    });

    it('flags a draft profile as not checkout-ready while still previewing coverage', async () => {
      const seller = await createSeller('shipping-preview-draft');
      const created = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
        .set('Idempotency-Key', randomUUID())
        .send({
          name: 'Draft coverage',
          rates: [
            {
              destination_scope: 'everywhere_else',
              one_item_fee_minor: 0,
              additional_item_fee_minor: 0,
            },
          ],
        })
        .expect(201);

      const response = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${created.body.id}/preview`)
        .send({ country_code: 'US', quantity: 1 })
        .expect(200);

      expect(response.body).toMatchObject({
        matched: true,
        checkout_ready: false,
        total_minor: 0,
      });
      expect(response.body.readiness_issues).toEqual(expect.arrayContaining(['draft']));
    });
  });

  describe('product assignment and publish readiness', () => {
    it('assigns one profile per product and counts the products that use it', async () => {
      const seller = await createSeller('shipping-assign');
      const profile = await createActiveProfile(seller, 'Standard shipping');
      const shared = await createActiveProfile(seller, 'Express shipping');
      const first = await createProduct({ seller, title: 'Mug One', sku: 'MUG-1' });
      const second = await createProduct({ seller, title: 'Mug Two', sku: 'MUG-2' });

      expect((await assignProfile(seller, first.productId, profile.id)).status).toBe(204);
      expect((await assignProfile(seller, second.productId, profile.id)).status).toBe(204);

      const profileResponse = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${profile.id}`)
        .expect(200);

      expect(profileResponse.body.assigned_product_count).toBe(2);

      const detail = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/products/${first.productId}`)
        .expect(200);

      expect(detail.body.shipping).toMatchObject({
        profile_id: profile.id,
        profile_name: 'Standard shipping',
        profile_status: 'active',
        checkout_ready: true,
      });

      expect((await assignProfile(seller, first.productId, shared.id)).status).toBe(204);

      const reassigned = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${profile.id}`)
        .expect(200);

      expect(reassigned.body.assigned_product_count).toBe(1);

      expect((await assignProfile(seller, second.productId, null)).status).toBe(204);

      const afterClear = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${profile.id}`)
        .expect(200);

      expect(afterClear.body.assigned_product_count).toBe(0);
    });

    it('refuses to assign an archived profile and refuses to archive a published product profile', async () => {
      const seller = await createSeller('shipping-archive-guard');
      const profile = await createActiveProfile(seller, 'Standard shipping');
      const product = await createProduct({ seller, title: 'Archive guard', sku: 'GUARD-1' });

      expect((await assignProfile(seller, product.productId, profile.id)).status).toBe(204);
      await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/products/${product.productId}/publish`)
        .set('Idempotency-Key', randomUUID())
        .expect(201);

      const blocked = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${profile.id}/archive`)
        .set('Idempotency-Key', randomUUID())
        .expect(409);

      expect(blocked.body).toMatchObject({
        code: 'ShippingProfileInUseError',
        assigned_product_count: 1,
      });

      const draftProfile = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Retired profile' })
        .expect(201);

      await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${draftProfile.body.id}/archive`)
        .set('Idempotency-Key', randomUUID())
        .expect(200);

      const rejected = await assignProfile(seller, product.productId, draftProfile.body.id);

      expect(rejected.status).toBe(422);
      expect(rejected.body.code).toBe('InvalidProductVariantConfigurationError');
    });

    it('requires a checkout-ready active profile before a product can be published', async () => {
      const seller = await createSeller('shipping-publish-gate');
      const draftProfile = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Not ready yet' })
        .expect(201);
      const product = await createProduct({ seller, title: 'Publish gate', sku: 'GATE-1' });

      expect((await assignProfile(seller, product.productId, draftProfile.body.id)).status).toBe(204);

      const blocked = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/products/${product.productId}/publish`)
        .set('Idempotency-Key', randomUUID())
        .expect(400);

      expect(blocked.body.message).toMatch(/draft|rate/i);

      const activated = await seller.agent
        .patch(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${draftProfile.body.id}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          version: draftProfile.body.version,
          status: 'active',
          processing_time_min_days: 1,
          processing_time_max_days: 2,
          rates: [
            {
              destination_scope: 'country',
              destination_country: 'US',
              one_item_fee_minor: 599,
              additional_item_fee_minor: 199,
              delivery_time_min_days: 2,
              delivery_time_max_days: 6,
            },
          ],
        })
        .expect(200);

      expect(activated.body).toMatchObject({ status: 'active', checkout_ready: true });

      await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/products/${product.productId}/publish`)
        .set('Idempotency-Key', randomUUID())
        .expect(201);
    });

    it('keeps a published product on a checkout-ready profile', async () => {
      const seller = await createSeller('shipping-published-guard');
      const profile = await createActiveProfile(seller, 'Standard shipping');
      const product = await createProduct({ seller, title: 'Live listing', sku: 'LIVE-1' });

      expect((await assignProfile(seller, product.productId, profile.id)).status).toBe(204);
      await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/products/${product.productId}/publish`)
        .set('Idempotency-Key', randomUUID())
        .expect(201);

      const draftProfile = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
        .set('Idempotency-Key', randomUUID())
        .send({
          name: 'Not ready yet',
          rates: [
            {
              destination_scope: 'everywhere_else',
              one_item_fee_minor: 100,
              additional_item_fee_minor: 50,
            },
          ],
        })
        .expect(201);

      const rejectedDraft = await assignProfile(seller, product.productId, draftProfile.body.id);
      expect(rejectedDraft.status).toBe(422);
      expect(rejectedDraft.body.message).toMatch(/cannot price a checkout yet/i);

      const rejectedClear = await assignProfile(seller, product.productId, null);
      expect(rejectedClear.status).toBe(422);
      expect(rejectedClear.body.message).toMatch(/must keep a checkout-ready/i);

      const detail = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/products/${product.productId}`)
        .expect(200);

      expect(detail.body.shipping).toMatchObject({
        profile_id: profile.id,
        checkout_ready: true,
      });
      expect(detail.body.state).toBe('active');

      // A draft Product may still hold a work-in-progress profile.
      const draftProduct = await createProduct({ seller, title: 'Work in progress', sku: 'WIP-1' });
      expect((await assignProfile(seller, draftProduct.productId, draftProfile.body.id)).status).toBe(204);
    });

    it('keeps a shared profile edit visible to every assigned product without copying configuration', async () => {
      const seller = await createSeller('shipping-shared-edit');
      const profile = await createActiveProfile(seller, 'Shared shipping');
      const first = await createProduct({ seller, title: 'Shared one', sku: 'SHARED-1' });
      const second = await createProduct({ seller, title: 'Shared two', sku: 'SHARED-2' });

      expect((await assignProfile(seller, first.productId, profile.id)).status).toBe(204);
      expect((await assignProfile(seller, second.productId, profile.id)).status).toBe(204);

      await seller.agent
        .patch(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${profile.id}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          version: profile.version,
          rates: [
            {
              destination_scope: 'everywhere_else',
              one_item_fee_minor: 1234,
              additional_item_fee_minor: 0,
              delivery_time_min_days: 6,
              delivery_time_max_days: 12,
            },
          ],
        })
        .expect(200);

      for (const productId of [first.productId, second.productId]) {
        const detail = await seller.agent
          .get(`${API_PREFIX}/shops/${seller.shopId}/products/${productId}`)
          .expect(200);

        expect(detail.body.shipping.profile_id).toBe(profile.id);
        expect(detail.body.shipping.rates).toHaveLength(1);
        expect(detail.body.shipping.rates[0]).toMatchObject({
          destination_scope: 'everywhere_else',
          one_item_fee_minor: 1234,
        });
      }

      const rateRows = await sql.query<{ count: string }>(
        'select count(*)::text as "count" from "shipping_profile_rates" where "shipping_profile_id" = $1',
        [profile.id],
      );

      expect(rateRows.rows[0].count).toBe('1');
    });

    it('refuses a profile edit that would stop being checkout-ready while published products reference it', async () => {
      const seller = await createSeller('shipping-degrade-guard');
      const profile = await createActiveProfile(seller, 'Standard shipping');
      const product = await createProduct({ seller, title: 'Live listing', sku: 'DEGRADE-1' });

      expect((await assignProfile(seller, product.productId, profile.id)).status).toBe(204);
      await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/products/${product.productId}/publish`)
        .set('Idempotency-Key', randomUUID())
        .expect(201);

      // Removing the range from an Active profile is rejected by
      // configuration validation before it can stop pricing checkouts.
      const blockedByMissingRange = await seller.agent
        .patch(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${profile.id}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          version: profile.version,
          processing_time_min_days: null,
          processing_time_max_days: null,
        })
        .expect(422);

      expect(blockedByMissingRange.body.message).toMatch(/processing time/i);

      // Switching a referenced profile to Draft passes value validation but
      // would stop pricing checkouts, so the published-reference guard rejects it.
      const blockedByDraft = await seller.agent
        .patch(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${profile.id}`)
        .set('Idempotency-Key', randomUUID())
        .send({ version: profile.version, status: 'draft' })
        .expect(409);

      expect(blockedByDraft.body).toMatchObject({
        code: 'ShippingProfileReadinessRequiredError',
        published_product_count: 1,
      });

      // The published Product is untouched and its profile still prices checkouts.
      const detail = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/products/${product.productId}`)
        .expect(200);

      expect(detail.body.shipping).toMatchObject({ profile_id: profile.id, checkout_ready: true });
      expect(detail.body.shipping.readiness_issues).toEqual([]);
    });

    it('blocks a published digital product from turning physical without a checkout-ready profile', async () => {
      const seller = await createSeller('shipping-digital-to-physical');
      const digital = await createProduct({
        seller, title: 'Digital guide', sku: 'DIGI-1', isDigital: true, 
      });

      await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/products/${digital.productId}/publish`)
        .set('Idempotency-Key', randomUUID())
        .expect(201);

      const beforeTransition = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/products/${digital.productId}`)
        .expect(200);

      const rejectedWithoutProfile = await seller.agent
        .patch(`${API_PREFIX}/shops/${seller.shopId}/products/${digital.productId}/details`)
        .set('Idempotency-Key', randomUUID())
        .send({
          product_version: beforeTransition.body.product_version,
          is_digital: false,
        })
        .expect(400);

      expect(rejectedWithoutProfile.body.message).toMatch(/shipping profile/i);

      // A draft digital product may still switch type freely.
      const draftDigital = await createProduct({
        seller, title: 'Draft digital', sku: 'DIGI-2', isDigital: true, 
      });
      const draftBefore = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/products/${draftDigital.productId}`)
        .expect(200);

      await seller.agent
        .patch(`${API_PREFIX}/shops/${seller.shopId}/products/${draftDigital.productId}/details`)
        .set('Idempotency-Key', randomUUID())
        .send({ product_version: draftBefore.body.product_version, is_digital: false })
        .expect(200);

      // With a checkout-ready profile assigned the same transition succeeds.
      const profile = await createActiveProfile(seller, 'Standard shipping');
      expect((await assignProfile(seller, digital.productId, profile.id)).status).toBe(204);

      const readyProduct = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/products/${digital.productId}`)
        .expect(200);

      const transitioned = await seller.agent
        .patch(`${API_PREFIX}/shops/${seller.shopId}/products/${digital.productId}/details`)
        .set('Idempotency-Key', randomUUID())
        .send({
          product_version: readyProduct.body.product_version,
          is_digital: false,
        })
        .expect(200);

      expect(transitioned.body).toMatchObject({ is_digital: false, state: 'active' });
    });

    it('serializes assignment behind the profile row lock archive takes', async () => {
      const seller = await createSeller('shipping-assignment-lock');
      const profile = await createActiveProfile(seller, 'Locked profile');
      const product = await createProduct({ seller, title: 'Locked assignment', sku: 'LOCK-1' });

      const blocker = new Client({
        host: testDb.rootConfig.host,
        port: testDb.rootConfig.port,
        user: testDb.rootConfig.user,
        password: testDb.rootConfig.password,
        database: testDb.dbName,
      });
      await blocker.connect();

      try {
        await blocker.query('begin');
        await blocker.query(
          'select "id" from "shipping_profiles" where "id" = $1 for update',
          [profile.id],
        );

        const assignment = assignProfile(seller, product.productId, profile.id);

        // Archive the profile inside the same transaction that holds the row
        // lock, then release it. An assignment that does not take the same
        // lock would read the still-active profile and attach it.
        await blocker.query(
          'update "shipping_profiles" set "status" = \'archived\', "version" = "version" + 1 where "id" = $1',
          [profile.id],
        );
        await blocker.query('commit');

        const assignmentResponse = await assignment;

        expect(assignmentResponse.status).toBe(422);
        expect(assignmentResponse.body.message).toMatch(/archived/i);
      }
      finally {
        await blocker.end();
      }

      const detail = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/products/${product.productId}`)
        .expect(200);

      expect(detail.body.shipping).toBeUndefined();
    });

    it('keeps archive and publish mutually exclusive so no published product ends on an archived profile', async () => {
      const seller = await createSeller('shipping-publish-archive-race');
      const profile = await createActiveProfile(seller, 'Race profile');
      const product = await createProduct({ seller, title: 'Race listing', sku: 'RACE-1' });

      expect((await assignProfile(seller, product.productId, profile.id)).status).toBe(204);

      const [publishResponse, archiveResponse] = await Promise.all([
        seller.agent
          .post(`${API_PREFIX}/shops/${seller.shopId}/products/${product.productId}/publish`)
          .set('Idempotency-Key', randomUUID()),
        seller.agent
          .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${profile.id}/archive`)
          .set('Idempotency-Key', randomUUID()),
      ]);

      const profileState = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${profile.id}`)
        .expect(200);
      const productState = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/products/${product.productId}`)
        .expect(200);

      expect(
        productState.body.state === 'active' && profileState.body.status === 'archived',
      ).toBe(false);

      if (profileState.body.status === 'archived') {
        expect(publishResponse.status).toBeGreaterThanOrEqual(400);
      }
      else {
        expect(archiveResponse.status).toBe(409);
      }
    });
  });

  describe('default shipping profile', () => {
    async function listProfiles(seller: TestSeller): Promise<ShippingProfileResource[]> {
      const response = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
        .expect(200);

      return response.body.results as ShippingProfileResource[];
    }

    function setDefault(seller: TestSeller, profileId: string) {
      return seller.agent.put(
        `${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${profileId}/default`,
      );
    }

    function clearDefault(seller: TestSeller, profileId: string) {
      return seller.agent.delete(
        `${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${profileId}/default`,
      );
    }

    async function createDraftProfile(seller: TestSeller, name: string): Promise<ShippingProfileResource> {
      const response = await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles`)
        .set('Idempotency-Key', randomUUID())
        .send({ ...createActiveProfileBody(name), status: 'draft' })
        .expect(201);

      return response.body as ShippingProfileResource;
    }

    it('designates one profile at a time and clears the previous default', async () => {
      const seller = await createSeller('shipping-default');
      const first = await createActiveProfile(seller, 'Standard');
      const second = await createActiveProfile(seller, 'Express');

      const designatedFirst = await setDefault(seller, first.id).expect(200);
      expect(designatedFirst.body.is_default).toBe(true);

      const designatedSecond = await setDefault(seller, second.id).expect(200);
      expect(designatedSecond.body.is_default).toBe(true);

      const afterSecond = await listProfiles(seller);
      expect(afterSecond.filter((profile) => profile.is_default).map((profile) => profile.id))
        .toEqual([second.id]);

      const cleared = await clearDefault(seller, second.id).expect(200);
      expect(cleared.body.is_default).toBe(false);

      expect((await listProfiles(seller)).some((profile) => profile.is_default)).toBe(false);
    });

    it('rejects a draft, an archived, and an unknown profile as the default', async () => {
      const seller = await createSeller('shipping-default-ineligible');
      const draft = await createDraftProfile(seller, 'Draft candidate');

      await setDefault(seller, draft.id).expect(409);

      const archived = await createActiveProfile(seller, 'Archived candidate');
      await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${archived.id}/archive`)
        .set('Idempotency-Key', randomUUID())
        .expect(200);

      await setDefault(seller, archived.id).expect(409);
      await setDefault(seller, randomUUID()).expect(404);
    });

    it('keeps the current default when a different profile is cleared', async () => {
      const seller = await createSeller('shipping-default-clear-other');
      const designated = await createActiveProfile(seller, 'Designated');
      const other = await createActiveProfile(seller, 'Not designated');

      await setDefault(seller, designated.id).expect(200);

      const cleared = await clearDefault(seller, other.id).expect(200);
      expect(cleared.body.is_default).toBe(false);

      expect((await listProfiles(seller)).filter((profile) => profile.is_default).map((profile) => profile.id))
        .toEqual([designated.id]);
    });

    it('clears the designation when its profile is archived', async () => {
      const seller = await createSeller('shipping-default-archive');
      const profile = await createActiveProfile(seller, 'Archivable');

      await setDefault(seller, profile.id).expect(200);

      await seller.agent
        .post(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${profile.id}/archive`)
        .set('Idempotency-Key', randomUUID())
        .expect(200);

      const detail = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${profile.id}`)
        .expect(200);

      expect(detail.body.status).toBe('archived');
      expect(detail.body.is_default).toBe(false);
    });

    it('clears the designation when an edit stops the profile being checkout-ready', async () => {
      const seller = await createSeller('shipping-default-degrade');
      const profile = await createActiveProfile(seller, 'Degradable');

      await setDefault(seller, profile.id).expect(200);

      // Moving back to draft keeps the rates but makes the profile unable to
      // price a checkout, so it cannot stay the shop default.
      await seller.agent
        .patch(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${profile.id}`)
        .set('Idempotency-Key', randomUUID())
        .send({ version: profile.version, status: 'draft' })
        .expect(200);

      const detail = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/shipping-profiles/${profile.id}`)
        .expect(200);

      expect(detail.body.checkout_ready).toBe(false);
      expect(detail.body.is_default).toBe(false);
    });

    it('keeps the configuration version unchanged when the designation changes', async () => {
      const seller = await createSeller('shipping-default-version');
      const profile = await createActiveProfile(seller, 'Versioned');

      const designated = await setDefault(seller, profile.id).expect(200);
      expect(designated.body.version).toBe(profile.version);

      const cleared = await clearDefault(seller, profile.id).expect(200);
      expect(cleared.body.version).toBe(profile.version);
    });

    it('leaves exactly one default when two profiles are designated concurrently', async () => {
      const seller = await createSeller('shipping-default-race');
      const first = await createActiveProfile(seller, 'Race A');
      const second = await createActiveProfile(seller, 'Race B');

      const responses = await Promise.all([
        setDefault(seller, first.id),
        setDefault(seller, second.id),
      ]);

      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      expect((await listProfiles(seller)).filter((profile) => profile.is_default)).toHaveLength(1);
    });

    it('enforces at most one default per shop at the database level', async () => {
      const seller = await createSeller('shipping-default-constraint');
      const first = await createActiveProfile(seller, 'Constraint A');
      const second = await createActiveProfile(seller, 'Constraint B');

      await sql.query(
        'update "shipping_profiles" set "is_default" = true where "id" = $1',
        [first.id],
      );

      await expect(sql.query(
        'update "shipping_profiles" set "is_default" = true where "id" = $1',
        [second.id],
      )).rejects.toThrow();
    });

    it('never assigns the default to a product on its own', async () => {
      const seller = await createSeller('shipping-default-no-fallback');
      const profile = await createActiveProfile(seller, 'Default but unassigned');

      await setDefault(seller, profile.id).expect(200);

      const product = await createProduct({ seller, title: 'Unassigned draft', sku: 'NOFALLBACK-1' });

      const detail = await seller.agent
        .get(`${API_PREFIX}/shops/${seller.shopId}/products/${product.productId}`)
        .expect(200);

      expect(detail.body.shipping).toBeUndefined();
    });
  });
});
