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
import { FieldEncryptionService } from '~/platform/crypto/field-encryption.service';
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
  private nextEvent: PaymentWebhookEvent | null = null;

  queueEvent(event: PaymentWebhookEvent): void {
    this.nextEvent = event;
  }

  async createCheckoutSession(_input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult> {
    const id = `cs_test_${randomUUID().replace(/-/g, '')}`;
    return {
      id,
      url: `https://pay.test/${id}`,
      expiresAt: new Date(Date.now() + (60 * 60 * 1000)),
    };
  }

  constructWebhookEvent(_payload: Buffer, _signature?: string): PaymentWebhookEvent {
    if (!this.nextEvent) throw new Error('No webhook event queued on FakePaymentGateway');
    const event = this.nextEvent;
    this.nextEvent = null;
    return event;
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
    process.env.FIELD_ENCRYPTION_KEY = '0123456789abcdef'.repeat(4);

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

  function accountBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      holder_name: '  Jane Seller  ',
      bank_name: '  Example Bank  ',
      country: 'us',
      account_reference: '0123456789',
      ...overrides,
    };
  }

  async function readActiveRows(shopId: string) {
    return sql.query<{
      id: string;
      provider_ref_encrypted: string;
      last4: string;
      currency: string;
      deactivated_at: Date | null;
      holder_name: string;
      bank_name: string;
    }>(
      `select id, provider_ref_encrypted, last4, currency, deactivated_at, holder_name, bank_name
       from "payout_accounts" where "shop_id" = $1 order by "created_at" asc`,
      [shopId],
    );
  }

  it('creates, reads masked, replaces, authorizes and audits a Payout Account', async () => {
    const url = `${API_PREFIX}/shops/${seller.shopPublicId}/finance/payout-account`;

    await seller.agent.get(url).expect(200, { payout_account: null });

    const firstWrite = await seller.agent
      .put(url)
      .set('Idempotency-Key', randomUUID())
      .send(accountBody())
      .expect(200);
    expect(firstWrite.body.payout_account).toMatchObject({
      holder_name: 'Jane Seller',
      bank_name: 'Example Bank',
      last4: '6789',
      country: 'US',
      currency: 'USD',
      status: 'pending',
      verified_at: null,
    });
    expect(JSON.stringify(firstWrite.body)).not.toContain('v1:');
    expect(firstWrite.body.payout_account).not.toHaveProperty('account_reference');
    expect(firstWrite.body.payout_account).not.toHaveProperty('provider_ref_encrypted');

    const firstId = firstWrite.body.payout_account.id as string;
    const firstRead = await seller.agent.get(url).expect(200);
    expect(firstRead.body).toEqual(firstWrite.body);
    expect(JSON.stringify(firstRead.body)).not.toContain('v1:');

    const firstRows = await readActiveRows(seller.shopId);
    expect(firstRows.rows).toHaveLength(1);
    expect(firstRows.rows[0].id).toBe(firstId);
    expect(firstRows.rows[0].provider_ref_encrypted).not.toBe('0123456789');
    expect(firstRows.rows[0].provider_ref_encrypted).toContain('v1:');
    expect(app.get(FieldEncryptionService).decrypt(firstRows.rows[0].provider_ref_encrypted))
      .toBe('0123456789');
    expect(firstRows.rows[0].holder_name).toBe('Jane Seller');
    expect(firstRows.rows[0].bank_name).toBe('Example Bank');

    const secondWrite = await seller.agent
      .put(url)
      .set('Idempotency-Key', randomUUID())
      .send(accountBody({ account_reference: 'ABC-987654' }))
      .expect(200);
    expect(secondWrite.body.payout_account.last4).toBe('7654');
    const replacedRows = await readActiveRows(seller.shopId);
    expect(replacedRows.rows).toHaveLength(2);
    expect(replacedRows.rows.filter((row) => row.deactivated_at === null)).toHaveLength(1);
    expect(replacedRows.rows.find((row) => row.id === firstId)?.deactivated_at).not.toBeNull();

    const secondSellerRead = await unrelatedSeller.agent.get(url);
    expect(secondSellerRead.status).toBe(403);
    const secondSellerWrite = await unrelatedSeller.agent
      .put(url)
      .set('Idempotency-Key', randomUUID())
      .send(accountBody());
    expect(secondSellerWrite.status).toBe(403);

    const adminUrl = `${API_PREFIX}/admin/shops/${seller.shopPublicId}/finance/payout-account`;
    expect((await seller.agent.get(adminUrl)).status).toBe(403);
    const adminRead = await admin.agent.get(adminUrl).expect(200);
    expect(adminRead.body).toMatchObject({
      shop_id: seller.shopPublicId,
      payout_account: { last4: '7654', status: 'pending' },
    });
    expect(JSON.stringify(adminRead.body)).not.toContain('v1:');
    expect((await admin.agent
      .put(adminUrl)
      .set('Idempotency-Key', randomUUID())
      .send(accountBody())).status).toBe(404);

    const settlement = await sql.query<{ currency: string }>(
      `select "currency" from "settlement_currency_history"
       where "shop_id" = $1 and "effective_to" is null order by "effective_from" desc limit 1`,
      [seller.shopId],
    );
    expect(replacedRows.rows.find((row) => row.deactivated_at === null)?.currency)
      .toBe(settlement.rows[0].currency);

    const audit = await sql.query<{ summary: Record<string, unknown> }>(
      `select "summary" from "audit_logs"
       where "action" = 'finance.payout_account.recorded' and "entity_id" = $1
       order by "created_at" asc`,
      [secondWrite.body.payout_account.id],
    );
    expect(audit.rows.length).toBeGreaterThan(0);
    expect(audit.rows[0].summary).toMatchObject({
      shopId: seller.shopId,
      last4: '7654',
      bankName: 'Example Bank',
    });
    expect(JSON.stringify(audit.rows[0].summary)).not.toContain('ABC-987654');
  });

  it('An operator verifies, re-verifies idempotently and disables a Payout Account', async () => {
    const write = await seller.agent
      .put(`${API_PREFIX}/shops/${seller.shopPublicId}/finance/payout-account`)
      .set('Idempotency-Key', randomUUID())
      .send(accountBody({ account_reference: 'VERIFY-1234' }))
      .expect(200);
    expect(write.body.payout_account.status).toBe('pending');
    expect(write.body.payout_account.verified_at).toBeNull();
    const accountId = write.body.payout_account.id as string;

    const verificationUrl = `${API_PREFIX}/admin/shops/${seller.shopPublicId}/finance/payout-account/verification`;

    const activated = await admin.agent
      .put(verificationUrl)
      .send({ status: 'active' })
      .expect(200);
    expect(activated.body).toMatchObject({
      shop_id: seller.shopPublicId,
      payout_account: { status: 'active', last4: '1234' },
    });
    const verifiedAt = activated.body.payout_account.verified_at as string;
    expect(verifiedAt).not.toBeNull();

    const repeated = await admin.agent
      .put(verificationUrl)
      .send({ status: 'active' })
      .expect(200);
    expect(repeated.body.payout_account.status).toBe('active');
    expect(repeated.body.payout_account.verified_at).toBe(verifiedAt);

    const disabled = await admin.agent
      .put(verificationUrl)
      .send({ status: 'disabled' })
      .expect(200);
    expect(disabled.body.payout_account.status).toBe('disabled');
    expect(disabled.body.payout_account.verified_at).toBe(verifiedAt);

    const rows = await sql.query<{ status: string; verified_at: Date }>(
      `select "status", "verified_at" from "payout_accounts"
       where "shop_id" = $1 and "deactivated_at" is null`,
      [seller.shopId],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].status).toBe('disabled');

    const audit = await sql.query<{ summary: Record<string, unknown> }>(
      `select "summary" from "audit_logs"
       where "action" = 'finance.payout_account.verification_recorded' and "entity_id" = $1
       order by "created_at" asc`,
      [accountId],
    );
    expect(audit.rows.map((row) => row.summary)).toEqual([
      expect.objectContaining({
        shopId: seller.shopId, previousStatus: 'pending', status: 'active', last4: '1234', 
      }),
      expect.objectContaining({ previousStatus: 'active', status: 'active', last4: '1234' }),
      expect.objectContaining({ previousStatus: 'active', status: 'disabled', last4: '1234' }),
    ]);
    expect(JSON.stringify(audit.rows)).not.toContain('VERIFY-1234');
  });

  it('Refuses verification from non-admins and unknown statuses', async () => {
    const verificationUrl = `${API_PREFIX}/admin/shops/${seller.shopPublicId}/finance/payout-account/verification`;

    expect((await seller.agent.put(verificationUrl).send({ status: 'active' })).status)
      .toBe(403);
    expect((await request(app.getHttpServer()).put(verificationUrl).send({ status: 'active' })).status)
      .toBe(401);

    const unknown = await admin.agent.put(verificationUrl).send({ status: 'pending' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe('PAYOUT_ACCOUNT_INVALID');

    const rows = await sql.query<{ status: string }>(
      `select "status" from "payout_accounts"
       where "shop_id" = $1 and "deactivated_at" is null`,
      [seller.shopId],
    );
    expect(rows.rows[0].status).toBe('disabled');
  });

  it.each([
    ['malformed reference', { account_reference: '12 34' }],
    ['blank holder', { holder_name: '   ' }],
    ['bad country', { country: 'USA' }],
  ])('refuses a %s with PAYOUT_ACCOUNT_INVALID', async (_name, invalidField) => {
    const response = await seller.agent
      .put(`${API_PREFIX}/shops/${seller.shopPublicId}/finance/payout-account`)
      .set('Idempotency-Key', randomUUID())
      .send(accountBody(invalidField));
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('PAYOUT_ACCOUNT_INVALID');
  });
});
