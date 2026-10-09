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
import { Clock } from '~/platform/time/clock';
import { ObservabilityService } from '~/platform/observability/observability.service';
import { RequestContextService } from '~/platform/request-context/request-context.service';
import { createTestDatabase, dropTestDatabase } from '../support/test-postgres';
import type { TestDatabaseContext } from '../support/test-postgres';
import { seedAuthReferenceData } from '../../database/seeds/auth.seed';
import { resolveShopId, seedPublishableInventory } from '../support/shipping-fixtures';

jest.setTimeout(240_000);

const API_PREFIX = '/v1';
const VALID_TEST_PASSWORD = 'Password123!';
const DAY_MS = 24 * 60 * 60 * 1000;

type TestDatabase = TestDatabaseContext;

type TestSeller = {
  agent: Agent; email: string; shopId: string; shopPublicId: string 
};

type ShopPromoCodeResponse = {
  id: string;
  shop: string;
  name: string;
  code: string;
  percent_off: number;
  currency: string;
  visibility: string;
  product_scope: string;
  product_ids: string[];
  start_at: string;
  end_at: string;
  timezone: string;
  status: string;
  max_redemptions: number | null;
  max_redemptions_per_buyer: number | null;
  redemption_count: number;
  exhausted: boolean;
  cancelled_at?: string | null;
  ended_at?: string | null;
  created_at: string;
  updated_at: string;
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

describe('Shop promo code creation (integration)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: TestDatabase;
  let storageRoot: string;
  let sql: Client;
  let categoryId: string | undefined;
  let jobDispatcher: { dispatch: jest.Mock };
  let testNow: Date;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testNow = new Date();
    jobDispatcher = { dispatch: jest.fn().mockResolvedValue(undefined) };
    testDb = await createTestDatabase('promo-code-creation');
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-promo-code-int-'));

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
        shop_name: `promo${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`,
        currency: 'USD',
      })
      .expect(201);

    return {
      agent, email, shopId: await resolveShopId(sql, shopResponse.body.id as string), shopPublicId: shopResponse.body.id as string,
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

  async function createProduct(input: {
    seller: TestSeller;
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
        description: 'Promo code product',
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

    return { productId, inventoryId };
  }

  function createPromoCode(
    seller: TestSeller,
    body: Record<string, unknown>,
  ) {
    return seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/promo-codes`)
      .set('Idempotency-Key', randomUUID())
      .send(body);
  }

  async function listPromoCodes(seller: TestSeller): Promise<ShopPromoCodeResponse[]> {
    const response = await seller.agent
      .get(`${API_PREFIX}/shops/${seller.shopPublicId}/promo-codes`)
      .query({ limit: 100 })
      .expect(200);

    return response.body.results as ShopPromoCodeResponse[];
  }

  function cancelPromoCode(seller: TestSeller, promoCodeId: string) {
    return seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/promo-codes/${promoCodeId}/cancel`)
      .set('Idempotency-Key', randomUUID());
  }

  function endPromoCode(seller: TestSeller, promoCodeId: string) {
    return seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/promo-codes/${promoCodeId}/end`)
      .set('Idempotency-Key', randomUUID());
  }

  function bulkStopPromoCodes(seller: TestSeller, ids: string[]) {
    return seller.agent
      .post(`${API_PREFIX}/shops/${seller.shopPublicId}/promo-codes/bulk-stop`)
      .set('Idempotency-Key', randomUUID())
      .send({ ids });
  }

  it('creates a percentage promo code with selected products and lists it', async () => {
    const seller = await registerSeller('promo-create');
    const targeted = await createProduct({
      seller,
      title: 'Targeted Shirt',
      sku: 'PROMO-TARGET-1',
      amountMinor: 5000,
    });
    const untargeted = await createProduct({
      seller,
      title: 'Untargeted Mug',
      sku: 'PROMO-OTHER-1',
      amountMinor: 3000,
    });

    const start = new Date(testNow.getTime() + DAY_MS);
    const end = new Date(testNow.getTime() + (7 * DAY_MS));

    const createResponse = await createPromoCode(seller, {
      name: 'Autumn Promo',
      code: 'AUTUMN20',
      percent_off: 20,
      visibility: 'public',
      product_scope: 'specific',
      product_ids: [targeted.productId],
      timezone: 'UTC',
      start_local: utcLocalDateTime(start),
      end_local: utcLocalDateTime(end),
    }).expect(201);

    const promoCode = createResponse.body.promo_code as ShopPromoCodeResponse;
    expect(promoCode.name).toBe('Autumn Promo');
    expect(promoCode.code).toBe('AUTUMN20');
    expect(promoCode.percent_off).toBe(20);
    expect(promoCode.visibility).toBe('public');
    expect(promoCode.product_scope).toBe('specific');
    expect(promoCode.product_ids).toEqual([targeted.productId]);
    expect(promoCode.currency).toBe('USD');
    expect(promoCode.timezone).toBe('UTC');
    expect(promoCode.status).toBe('scheduled');

    const listed = await listPromoCodes(seller);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(promoCode.id);
    expect(listed[0].code).toBe('AUTUMN20');
    expect(listed[0].status).toBe('scheduled');
    expect(listed[0].product_scope).toBe('specific');
    expect(listed[0].product_ids).toEqual([targeted.productId]);

    // Untargeted product is not in scope.
    expect(listed[0].product_ids).not.toContain(untargeted.productId);
  });

  it('creates a promo code with redemption limits and lists its allowance', async () => {
    const seller = await registerSeller('promo-limits');

    const createResponse = await createPromoCode(seller, {
      name: 'Limited Promo',
      code: 'LIMITED25',
      percent_off: 25,
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(testNow.getTime() + DAY_MS)),
      max_redemptions: 3,
      max_redemptions_per_buyer: 1,
    }).expect(201);

    const promoCode = createResponse.body.promo_code as ShopPromoCodeResponse;
    expect(promoCode.max_redemptions).toBe(3);
    expect(promoCode.max_redemptions_per_buyer).toBe(1);
    expect(promoCode.redemption_count).toBe(0);
    expect(promoCode.exhausted).toBe(false);

    const listed = await listPromoCodes(seller);
    expect(listed[0].max_redemptions).toBe(3);
    expect(listed[0].max_redemptions_per_buyer).toBe(1);
    expect(listed[0].redemption_count).toBe(0);
    expect(listed[0].exhausted).toBe(false);
  });

  it('leaves both redemption dimensions unlimited when they are omitted', async () => {
    const seller = await registerSeller('promo-unlimited');

    await createPromoCode(seller, {
      name: 'Unlimited Promo',
      code: 'FREEDOM10',
      percent_off: 10,
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(testNow.getTime() + DAY_MS)),
    }).expect(201);

    const [listed] = await listPromoCodes(seller);
    expect(listed.max_redemptions).toBeNull();
    expect(listed.max_redemptions_per_buyer).toBeNull();
    expect(listed.exhausted).toBe(false);
  });

  it('rejects a non-positive redemption limit', async () => {
    const seller = await registerSeller('promo-bad-limit');

    await createPromoCode(seller, {
      name: 'Bad Limit',
      code: 'BADLIMIT',
      percent_off: 10,
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(testNow.getTime() + DAY_MS)),
      max_redemptions: 0,
    }).expect(400);
  });

  it('rejects a duplicate promo code differing only in case with 409', async () => {
    const seller = await registerSeller('promo-dup');

    await createPromoCode(seller, {
      name: 'First Code',
      code: 'SUMMER10',
      percent_off: 10,
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(testNow.getTime() + DAY_MS)),
    }).expect(201);

    const duplicateResponse = await createPromoCode(seller, {
      name: 'Second Code',
      code: 'summer10',
      percent_off: 15,
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(testNow.getTime() + DAY_MS)),
    }).expect(409);

    // The client branches and writes its own copy from `code`; the human
    // `message` stays a fallback for codes a client does not know yet.
    expect(duplicateResponse.body.code).toBe('PROMO_CODE_ALREADY_EXISTS');
  });

  it('allows the same code in a different shop', async () => {
    const sellerA = await registerSeller('promo-shop-a');
    const sellerB = await registerSeller('promo-shop-b');

    await createPromoCode(sellerA, {
      name: 'Shop A Code',
      code: 'SHARED',
      percent_off: 10,
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(testNow.getTime() + DAY_MS)),
    }).expect(201);

    await createPromoCode(sellerB, {
      name: 'Shop B Code',
      code: 'shared',
      percent_off: 15,
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(testNow.getTime() + DAY_MS)),
    }).expect(201);
  });

  it('rejects a foreign-shop product target', async () => {
    const sellerA = await registerSeller('promo-owner');
    const sellerB = await registerSeller('promo-other');

    const foreignProduct = await createProduct({
      seller: sellerB,
      title: 'Foreign Product',
      sku: 'PROMO-FOREIGN-1',
      amountMinor: 4000,
    });

    await createPromoCode(sellerA, {
      name: 'Bad Scope',
      code: 'FOREIGN',
      percent_off: 10,
      product_scope: 'specific',
      product_ids: [foreignProduct.productId],
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(testNow.getTime() + DAY_MS)),
    }).expect(400);
  });

  it('rejects duplicate targets', async () => {
    const seller = await registerSeller('promo-dup-target');
    const product = await createProduct({
      seller,
      title: 'Dup Target',
      sku: 'PROMO-DUP-TARGET-1',
      amountMinor: 2500,
    });

    const response = await createPromoCode(seller, {
      name: 'Dup Target Code',
      code: 'DUPTARGET',
      percent_off: 10,
      product_scope: 'specific',
      product_ids: [product.productId, product.productId],
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(testNow.getTime() + DAY_MS)),
    }).expect(400);

    expect(response.body.code).toBe('PROMO_CODE_PRODUCT_SCOPE_INVALID');
  });

  it('rejects start >= end', async () => {
    const seller = await registerSeller('promo-window');
    const sameTime = new Date(testNow.getTime() + DAY_MS);

    await createPromoCode(seller, {
      name: 'Bad Window',
      code: 'BADWINDOW',
      percent_off: 10,
      timezone: 'UTC',
      start_local: utcLocalDateTime(sameTime),
      end_local: utcLocalDateTime(sameTime),
    }).expect(400);

    const reversedResponse = await createPromoCode(seller, {
      name: 'Reversed Window',
      code: 'REVERSED',
      percent_off: 10,
      timezone: 'UTC',
      start_local: utcLocalDateTime(new Date(testNow.getTime() + (2 * DAY_MS))),
      end_local: utcLocalDateTime(new Date(testNow.getTime() + DAY_MS)),
    }).expect(400);

    expect(reversedResponse.body.code).toBe('PROMO_CODE_END_AFTER_START_REQUIRED');
  });

  it('rejects percent 0 and 100', async () => {
    const seller = await registerSeller('promo-percent');

    await createPromoCode(seller, {
      name: 'Zero Percent',
      code: 'ZERO',
      percent_off: 0,
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(testNow.getTime() + DAY_MS)),
    }).expect(400);

    await createPromoCode(seller, {
      name: 'Full Percent',
      code: 'FULL',
      percent_off: 100,
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(testNow.getTime() + DAY_MS)),
    }).expect(400);
  });

  it('cancels scheduled promo codes and ends active ones individually and in bulk, keeping definitions and allowance', async () => {
    const seller = await registerSeller('promo-lifecycle');

    const scheduled = (await createPromoCode(seller, {
      name: 'Scheduled stop',
      code: 'SCHEDSTOP',
      percent_off: 10,
      visibility: 'public',
      timezone: 'UTC',
      start_local: utcLocalDateTime(new Date(testNow.getTime() + DAY_MS)),
      end_local: utcLocalDateTime(new Date(testNow.getTime() + (2 * DAY_MS))),
    }).expect(201)).body.promo_code as ShopPromoCodeResponse;

    const active = (await createPromoCode(seller, {
      name: 'Active stop',
      code: 'ACTIVESTOP',
      percent_off: 20,
      visibility: 'public',
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(testNow.getTime() + DAY_MS)),
      max_redemptions: 1,
    }).expect(201)).body.promo_code as ShopPromoCodeResponse;

    // Consumed allowance is an indicator separate from lifecycle: this active
    // code is already exhausted before it is stopped.
    await sql.query(
      `insert into "promotion_usages" ("id","created_at","updated_at","promotion_id","order_id","code")
       values ($1, now(), now(), $2, $3, $4)`,
      [randomUUID(), (await sql.query<{ id: string }>('select id from promotions where public_id = $1', [active.id])).rows[0]!.id, randomUUID(), 'ACTIVESTOP'],
    );

    const beforeStop = await listPromoCodes(seller);
    expect(beforeStop.find(entry => entry.id === active.id)).toMatchObject({
      status: 'active',
      redemption_count: 1,
      exhausted: true,
    });

    const cancelled = await cancelPromoCode(seller, scheduled.id).expect(201);
    expect(cancelled.body.promo_code).toMatchObject({
      id: scheduled.id,
      status: 'cancelled',
      name: 'Scheduled stop',
      percent_off: 10,
      timezone: 'UTC',
      redemption_count: 0,
      exhausted: false,
    });
    expect(cancelled.body.promo_code.cancelled_at).not.toBeNull();

    // The stop is irreversible and state-specific: neither action can run again,
    // and a scheduled code cannot be ended.
    await cancelPromoCode(seller, scheduled.id).expect(409);
    await endPromoCode(seller, scheduled.id).expect(409);

    const ended = await endPromoCode(seller, active.id).expect(201);
    expect(ended.body.promo_code).toMatchObject({
      id: active.id,
      status: 'ended',
      redemption_count: 1,
      exhausted: true,
    });
    expect(ended.body.promo_code.ended_at).not.toBeNull();
    await endPromoCode(seller, active.id).expect(409);

    // Bulk uses the same state rules and reports the ones it cannot stop.
    const scheduledTwo = (await createPromoCode(seller, {
      name: 'Scheduled two',
      code: 'BULKSCHED',
      percent_off: 15,
      timezone: 'UTC',
      start_local: utcLocalDateTime(new Date(testNow.getTime() + (3 * DAY_MS))),
      end_local: utcLocalDateTime(new Date(testNow.getTime() + (4 * DAY_MS))),
    }).expect(201)).body.promo_code as ShopPromoCodeResponse;
    const activeTwo = (await createPromoCode(seller, {
      name: 'Active two',
      code: 'BULKACTIVE',
      percent_off: 25,
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(testNow.getTime() + DAY_MS)),
    }).expect(201)).body.promo_code as ShopPromoCodeResponse;

    const missingId = 'prm_000000000000';
    const bulk = await bulkStopPromoCodes(seller, [
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

    // Stopping retains the definition, schedule, timezone and allowance, so the
    // seller list still explains every offer.
    const listed = await listPromoCodes(seller);
    const stoppedIds = [scheduled.id, active.id, scheduledTwo.id, activeTwo.id];
    expect(listed.map(entry => entry.id).sort()).toEqual(expect.arrayContaining([...stoppedIds].sort()));
    expect(listed.find(entry => entry.id === scheduled.id)).toMatchObject({
      name: 'Scheduled stop',
      code: 'SCHEDSTOP',
      percent_off: 10,
      status: 'cancelled',
    });
    expect(listed.find(entry => entry.id === activeTwo.id)).toMatchObject({
      name: 'Active two',
      code: 'BULKACTIVE',
      percent_off: 25,
      status: 'ended',
    });
  });

  it('never lets a stopped or expired promo code be reused', async () => {
    const seller = await registerSeller('promo-reuse');

    const scheduled = (await createPromoCode(seller, {
      name: 'Reuse source',
      code: 'REUSE10',
      percent_off: 10,
      timezone: 'UTC',
      start_local: utcLocalDateTime(new Date(testNow.getTime() + DAY_MS)),
      end_local: utcLocalDateTime(new Date(testNow.getTime() + (2 * DAY_MS))),
    }).expect(201)).body.promo_code as ShopPromoCodeResponse;

    await cancelPromoCode(seller, scheduled.id).expect(201);

    // A cancelled code identity is permanently unavailable, even for a
    // differently-cased reuse attempt.
    const reusedResponse = await createPromoCode(seller, {
      name: 'Reuse attempt',
      code: 'reuse10',
      percent_off: 15,
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(testNow.getTime() + DAY_MS)),
    }).expect(409);
    expect(reusedResponse.body.code).toBe('PROMO_CODE_ALREADY_EXISTS');

    // The same code is still free in another shop.
    const otherSeller = await registerSeller('promo-reuse-other');
    await createPromoCode(otherSeller, {
      name: 'Reuse elsewhere',
      code: 'REUSE10',
      percent_off: 5,
      timezone: 'UTC',
      start_now: true,
      end_local: utcLocalDateTime(new Date(testNow.getTime() + DAY_MS)),
    }).expect(201);
  });
});
