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
import { RequestContextService } from '~/platform/request-context/request-context.service';
import { ObservabilityService } from '~/platform/observability/observability.service';
import { PermissionEntity } from '~/domains/auth/infra/persistence/entities/permission.entity';
import { RolePermissionEntity } from '~/domains/auth/infra/persistence/entities/role-permission.entity';
import { RoleEntity } from '~/domains/auth/infra/persistence/entities/role.entity';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { LocalFileStorageService } from '~/integrations/storage/infra/local-file-storage.service';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import type {
  AppJobName,
  AppJobPayloadMap,
  DispatchJobOptions,
} from '~/platform/jobs/app-job.types';
import {
  PaymentGateway,
  type CheckoutSessionResult,
  type CreateCheckoutSessionInput,
  type PaymentWebhookEvent,
} from '~/integrations/payment/app/ports/payment-gateway';
import { createTestDatabase, dropTestDatabase } from '../support/test-postgres';
import type { TestDatabaseContext } from '../support/test-postgres';
import { seedAuthReferenceData } from '../../database/seeds/auth.seed';
import { resolveShopId } from '../support/shipping-fixtures';

jest.setTimeout(240_000);

const API_PREFIX = '/v1';
const VALID_TEST_PASSWORD = 'Password123!';

type TestDatabase = TestDatabaseContext;
type TestAgent = { agent: Agent; email: string; userId: string };
type TestSeller = TestAgent & { shopId: string; shopPublicId: string };

function restoreProcessEnv(originalEnv: NodeJS.ProcessEnv) {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

class NoopJobDispatcher extends JobDispatcher {
  async dispatch<TName extends AppJobName>(
    _name: TName,
    _payload: AppJobPayloadMap[TName],
    _options?: DispatchJobOptions,
  ): Promise<void> {}
}

class FakePaymentGateway extends PaymentGateway {
  async createCheckoutSession(_input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult> {
    const id = `cs_test_${randomUUID().replace(/-/g, '')}`;
    return {
      id,
      url: `https://pay.test/${id}`,
      expiresAt: new Date(Date.now() + (60 * 60 * 1000)),
    };
  }

  constructWebhookEvent(): PaymentWebhookEvent {
    throw new Error('No webhook event in this suite');
  }

  async retrieveCheckoutSession(sessionId: string): Promise<{
    id: string;
    status: string;
    paymentStatus: string;
  }> {
    return { id: sessionId, status: 'complete', paymentStatus: 'paid' };
  }

  async createRefund(_paymentIntentId: string) {
    return { id: `re_test_${randomUUID()}`, status: 'succeeded', amount: 0 };
  }

  async retrieveRefund(refundId: string): Promise<never> {
    throw new Error(`No refund ${refundId} on this gateway`);
  }

  async retrieveBalanceTransaction(reference: string): Promise<never> {
    throw new Error(`No balance transaction ${reference} on this gateway`);
  }
}

describe('Shop Payout Account (integration)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: TestDatabase;
  let storageRoot: string;
  let sql: Client;
  let admin: TestAgent;
  let seller: TestSeller;
  let unrelatedSeller: TestSeller;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase('finance_payout_account');
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-finance-payout-int-'));

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
    // The default adapter is manual_bank; this suite proves the local path
    // keeps payouts working without Stripe. Pin it explicitly so a developer's
    // .env cannot switch the suite onto the Connect gateway.
    process.env.PAYOUT_PROVIDER = 'manual_bank';

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

    // AppModule must be loaded after the throwaway database and encryption key env are applied.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('~/bootstrap/app.module') as typeof BootstrapAppModule;
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StorageService)
      .useValue(new LocalFileStorageService({ driver: 'local', localRoot: storageRoot }))
      .overrideProvider(JobDispatcher)
      .useValue(new NoopJobDispatcher())
      .overrideProvider(PaymentGateway)
      .useValue(new FakePaymentGateway())
      .compile();

    app = moduleFixture.createNestApplication();
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    app.enableShutdownHooks();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: validationExceptionFactory,
    }));
    const exceptionLogger = await app.resolve(PinoLogger);
    const requestLogger = await app.resolve(PinoLogger);
    app.useGlobalFilters(new GlobalExceptionFilter(app.get(RequestContextService), exceptionLogger));
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

    admin = await registerAgent('fin-admin', 'Admin');
    await assignRole(admin.userId, 'admin');
    seller = await registerSeller('fin-owner');
    unrelatedSeller = await registerSeller('fin-other');
  });

  afterAll(async () => {
    if (sql) await sql.end();
    if (app) await app.close();
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
    restoreProcessEnv(originalEnv);
    if (testDb) await dropTestDatabase(testDb);
  });

  async function registerAgent(prefix: string, displayName: string): Promise<TestAgent> {
    const agent = request.agent(app.getHttpServer());
    const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.com`;
    const response = await agent
      .post(`${API_PREFIX}/auth/register`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', `203.0.113.${Math.floor(Math.random() * 200) + 1}`)
      .send({ email, password: VALID_TEST_PASSWORD, displayName })
      .expect(201);
    return { agent, email, userId: response.body.user.id as string };
  }

  async function assignRole(userId: string, roleKey: 'admin' | 'seller'): Promise<void> {
    const role = await sql.query('select "id" from "roles" where "key" = $1', [roleKey]);
    await sql.query(
      `insert into "user_roles" ("id", "created_at", "updated_at", "assigned_at", "user_id", "role_id")
       values ($1, now(), now(), now(), $2, $3)`,
      [randomUUID(), userId, role.rows[0].id],
    );
  }

  async function registerSeller(prefix: string): Promise<TestSeller> {
    const created = await registerAgent(prefix, 'Seller');
    await assignRole(created.userId, 'seller');
    const response = await created.agent
      .post(`${API_PREFIX}/shops`)
      .set('Idempotency-Key', randomUUID())
      .send({ shop_name: `fin${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`, currency: 'USD' })
      .expect(201);
    return {
      ...created,
      shopId: await resolveShopId(sql, response.body.id as string),
      shopPublicId: response.body.id as string,
    };
  }

  function onboardingUrl(shopPublicId: string): string {
    return `${API_PREFIX}/shops/${shopPublicId}/finance/payout-account/onboarding`;
  }

  async function readActiveRows(shopId: string) {
    return sql.query<{
      id: string;
      provider: string;
      provider_account_id: string | null;
      country: string;
      currency: string;
      status: string;
      payouts_enabled: boolean;
      charges_enabled: boolean;
      transfers_capability: string | null;
      requirements: unknown;
      default_currency: string | null;
      deactivated_at: Date | null;
    }>(
      `select id, provider, provider_account_id, country, currency, status,
              payouts_enabled, charges_enabled, transfers_capability,
              requirements, default_currency, deactivated_at
       from "payout_accounts" where "shop_id" = $1 order by "created_at" asc`,
      [shopId],
    );
  }

  it('activates a local Payout Account on onboarding and reads only capability fields', async () => {
    const url = `${API_PREFIX}/shops/${seller.shopPublicId}/finance/payout-account`;

    await seller.agent.get(url).expect(200, { payout_account: null });

    const onboarded = await seller.agent
      .post(onboardingUrl(seller.shopPublicId))
      .set('Idempotency-Key', randomUUID())
      .send({ country: 'us' })
      .expect(200);
    expect(onboarded.body).toEqual({ url: null, status: 'active' });

    const read = await seller.agent.get(url).expect(200);
    expect(read.body.payout_account).toEqual({
      id: expect.any(String),
      provider: 'manual_bank',
      provider_account_id: null,
      country: 'US',
      currency: 'USD',
      status: 'active',
      payouts_enabled: true,
      charges_enabled: true,
      transfers_capability: 'active',
      requirements: null,
      default_currency: 'USD',
      bank_name: null,
      last4: null,
    });
    expect(read.body.payout_account).not.toHaveProperty('holder_name');
    expect(read.body.payout_account).not.toHaveProperty('verified_at');
    expect(JSON.stringify(read.body)).not.toContain('provider_ref_encrypted');

    const rows = await readActiveRows(seller.shopId);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      id: read.body.payout_account.id,
      provider: 'manual_bank',
      provider_account_id: null,
      country: 'US',
      currency: 'USD',
      status: 'active',
      payouts_enabled: true,
      transfers_capability: 'active',
      deactivated_at: null,
    });

    // Re-running onboarding reuses the same open row instead of creating another.
    const replayed = await seller.agent
      .post(onboardingUrl(seller.shopPublicId))
      .set('Idempotency-Key', randomUUID())
      .send({ country: 'US' })
      .expect(200);
    expect(replayed.body.status).toBe('active');
    expect((await readActiveRows(seller.shopId)).rows).toHaveLength(1);

    const audit = await sql.query<{ summary: Record<string, unknown> }>(
      `select "summary" from "audit_logs"
       where "action" = 'finance.payout_account.onboarding_started' and "entity_id" = $1
       order by "created_at" asc`,
      [read.body.payout_account.id],
    );
    expect(audit.rows.length).toBeGreaterThan(0);
    expect(audit.rows[0].summary).toMatchObject({
      shopId: seller.shopId,
      provider: 'manual_bank',
      providerAccountId: null,
      country: 'US',
      status: 'active',
    });
  });

  it('authorizes shop management and keeps the admin lookup read-only', async () => {
    const adminUrl = `${API_PREFIX}/admin/shops/${seller.shopPublicId}/finance/payout-account`;

    expect((await seller.agent.get(adminUrl)).status).toBe(403);

    const adminRead = await admin.agent.get(adminUrl).expect(200);
    expect(adminRead.body).toMatchObject({
      shop_id: seller.shopPublicId,
      payout_account: {
        provider: 'manual_bank',
        status: 'active',
        payouts_enabled: true,
      },
    });

    expect((await unrelatedSeller.agent
      .post(onboardingUrl(seller.shopPublicId))
      .set('Idempotency-Key', randomUUID())
      .send({ country: 'US' })).status).toBe(403);
    expect((await unrelatedSeller.agent
      .get(`${API_PREFIX}/shops/${seller.shopPublicId}/finance/payout-account`)).status)
      .toBe(403);
  });

  it('refuses a country that is not an ISO alpha-2 code', async () => {
    const response = await seller.agent
      .post(onboardingUrl(seller.shopPublicId))
      .set('Idempotency-Key', randomUUID())
      .send({ country: 'USA' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('PAYOUT_ACCOUNT_INVALID');
  });

  it('requires a country in the onboarding body', async () => {
    const response = await seller.agent
      .post(onboardingUrl(seller.shopPublicId))
      .set('Idempotency-Key', randomUUID())
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
  });
});
