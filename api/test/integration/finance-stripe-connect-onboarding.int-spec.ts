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
import {
  CONNECT_GATEWAY,
  type ConnectAccountDetails,
  type ConnectGateway,
  type CreateConnectAccountInput,
  type CreateConnectAccountLinkInput,
  type CreateConnectAccountLinkResult,
  type CreateConnectAccountResult,
} from '~/integrations/payment/app/ports/connect-gateway';
import { createTestDatabase, dropTestDatabase } from '../support/test-postgres';
import type { TestDatabaseContext } from '../support/test-postgres';
import { seedAuthReferenceData } from '../../database/seeds/auth.seed';
import { resolveShopId } from '../support/shipping-fixtures';

jest.setTimeout(240_000);

const API_PREFIX = '/v1';
const VALID_TEST_PASSWORD = 'Password123!';
const ACCOUNT_ID = 'acct_test_connect_1';

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

class FakeConnectGateway implements ConnectGateway {
  createAccountCalls: CreateConnectAccountInput[] = [];
  linkCalls: CreateConnectAccountLinkInput[] = [];
  private createdAccountCount = 0;

  async createAccount(
    input: CreateConnectAccountInput,
  ): Promise<CreateConnectAccountResult> {
    this.createAccountCalls.push(input);
    this.createdAccountCount += 1;

    // The first account is the fixture the main scenario asserts on; later
    // sellers get their own id so Stripe's provider-id uniqueness still holds.
    return {
      id: this.createdAccountCount === 1
        ? ACCOUNT_ID
        : `acct_test_connect_${this.createdAccountCount}`,
    };
  }

  async createAccountLink(
    input: CreateConnectAccountLinkInput,
  ): Promise<CreateConnectAccountLinkResult> {
    this.linkCalls.push(input);
    return { url: `https://connect.test/setup/${input.accountId}/${randomUUID()}` };
  }

  async retrieveAccount(accountId: string): Promise<ConnectAccountDetails> {
    return connectAccount({ id: accountId });
  }
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

  constructWebhookEvent(): PaymentWebhookEvent {
    if (!this.nextEvent) throw new Error('No webhook event queued on FakePaymentGateway');
    const event = this.nextEvent;
    this.nextEvent = null;
    return event;
  }

  async retrieveCheckoutSession(sessionId: string) {
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

function connectAccount(
  overrides: Partial<ConnectAccountDetails> = {},
): ConnectAccountDetails {
  return {
    id: ACCOUNT_ID,
    country: 'US',
    defaultCurrency: 'USD',
    payoutsEnabled: true,
    chargesEnabled: true,
    transfersCapability: 'active',
    requirementsDue: [],
    disabledReason: null,
    externalAccount: {
      bankName: 'Chase',
      last4: '6789',
      currency: 'USD',
      country: 'US',
      defaultForCurrency: true,
    },
    ...overrides,
  };
}

describe('Stripe Connect payout account onboarding (integration)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: TestDatabase;
  let storageRoot: string;
  let sql: Client;
  let seller: TestSeller;
  let connectGateway: FakeConnectGateway;
  let paymentGateway: FakePaymentGateway;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase('finance_stripe_connect');
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-finance-connect-int-'));

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
    process.env.PAYOUT_PROVIDER = 'stripe_connect';
    process.env.PAYOUT_CONNECT_COUNTRIES = 'US, GB';
    process.env.STRIPE_CONNECT_RETURN_URL = 'https://seller.test/finances?onboarding=return';
    process.env.STRIPE_CONNECT_REFRESH_URL = 'https://seller.test/finances?onboarding=refresh';

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

    // AppModule must be loaded after the throwaway database env is applied.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('~/bootstrap/app.module') as typeof BootstrapAppModule;
    connectGateway = new FakeConnectGateway();
    paymentGateway = new FakePaymentGateway();

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StorageService)
      .useValue(new LocalFileStorageService({ driver: 'local', localRoot: storageRoot }))
      .overrideProvider(JobDispatcher)
      .useValue(new NoopJobDispatcher())
      .overrideProvider(PaymentGateway)
      .useValue(paymentGateway)
      .overrideProvider(CONNECT_GATEWAY)
      .useValue(connectGateway)
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

    seller = await registerSeller('connect-owner');
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
      .set('X-Forwarded-For', `198.51.100.${Math.floor(Math.random() * 200) + 1}`)
      .send({ email, password: VALID_TEST_PASSWORD, displayName })
      .expect(201);
    return { agent, email, userId: response.body.user.id as string };
  }

  async function registerSeller(prefix: string): Promise<TestSeller> {
    const created = await registerAgent(prefix, 'Seller');
    const role = await sql.query('select "id" from "roles" where "key" = $1', ['seller']);
    await sql.query(
      `insert into "user_roles" ("id", "created_at", "updated_at", "assigned_at", "user_id", "role_id")
       values ($1, now(), now(), now(), $2, $3)`,
      [randomUUID(), created.userId, role.rows[0].id],
    );
    const response = await created.agent
      .post(`${API_PREFIX}/shops`)
      .set('Idempotency-Key', randomUUID())
      .send({ shop_name: `con${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`, currency: 'USD' })
      .expect(201);
    return {
      ...created,
      shopId: await resolveShopId(sql, response.body.id as string),
      shopPublicId: response.body.id as string,
    };
  }

  function financeUrl(shopPublicId: string, suffix: string): string {
    return `${API_PREFIX}/shops/${shopPublicId}/finance/${suffix}`;
  }

  function sendAccountUpdated(account: ConnectAccountDetails): request.Test {
    paymentGateway.queueEvent({
      id: `evt_${randomUUID()}`,
      type: 'account.updated',
      account: account.id,
      data: { object: account },
    });

    return request(app.getHttpServer())
      .post(`${API_PREFIX}/webhooks/stripe`)
      .send({})
      .expect(201);
  }

  async function readRows() {
    return sql.query<{
      id: string;
      provider: string;
      provider_account_id: string | null;
      status: string;
      payouts_enabled: boolean;
      charges_enabled: boolean;
      transfers_capability: string | null;
      requirements: { currentlyDue: string[]; disabledReason: string | null } | null;
      bank_name: string | null;
      last4: string | null;
    }>(
      `select id, provider, provider_account_id, status, payouts_enabled,
              charges_enabled, transfers_capability, requirements, bank_name, last4
       from "payout_accounts" where "shop_id" = $1 order by "created_at" asc`,
      [seller.shopId],
    );
  }

  it('starts onboarding, stores acct_…, reuses the account and syncs capabilities', async () => {
    await seller.agent
      .get(financeUrl(seller.shopPublicId, 'payout-account'))
      .expect(200, { payout_account: null });

    const started = await seller.agent
      .post(financeUrl(seller.shopPublicId, 'payout-account/onboarding'))
      .set('Idempotency-Key', randomUUID())
      .send({ country: 'US' })
      .expect(200);

    expect(started.body).toEqual({
      url: expect.stringContaining('https://connect.test/setup/acct_test_connect_1/'),
      status: 'onboarding',
    });
    expect(connectGateway.createAccountCalls).toEqual([
      { country: 'US', email: seller.email },
    ]);
    expect(connectGateway.linkCalls[0]).toMatchObject({
      accountId: ACCOUNT_ID,
      returnUrl: 'https://seller.test/finances?onboarding=return',
      refreshUrl: 'https://seller.test/finances?onboarding=refresh',
    });

    let rows = await readRows();
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      provider: 'stripe_connect',
      provider_account_id: ACCOUNT_ID,
      status: 'onboarding',
      payouts_enabled: false,
    });

    // A replayed onboarding reuses the stored account instead of minting another.
    const replayed = await seller.agent
      .post(financeUrl(seller.shopPublicId, 'payout-account/onboarding'))
      .set('Idempotency-Key', randomUUID())
      .send({ country: 'US' })
      .expect(200);
    expect(replayed.body.status).toBe('onboarding');
    expect(connectGateway.createAccountCalls).toHaveLength(1);
    expect((await readRows()).rows).toHaveLength(1);

    // No payout may be attempted while the account is still onboarding.
    const refused = await seller.agent
      .put(financeUrl(seller.shopPublicId, 'payout-settings'))
      .set('Idempotency-Key', randomUUID())
      .send({ auto_payout_enabled: true });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('AUTO_PAYOUT_NOT_ELIGIBLE');

    await sendAccountUpdated(connectAccount());

    const read = await seller.agent
      .get(financeUrl(seller.shopPublicId, 'payout-account'))
      .expect(200);
    expect(read.body.payout_account).toMatchObject({
      provider: 'stripe_connect',
      provider_account_id: ACCOUNT_ID,
      country: 'US',
      currency: 'USD',
      status: 'active',
      payouts_enabled: true,
      charges_enabled: true,
      transfers_capability: 'active',
      requirements: { currently_due: [], disabled_reason: null },
      default_currency: 'USD',
      bank_name: 'Chase',
      last4: '6789',
    });
    // Display metadata is the only bank data stored; no holder name or
    // verification timestamp exists on the connect row.
    for (const absentField of ['holder_name', 'verified_at']) {
      expect(read.body.payout_account).not.toHaveProperty(absentField);
    }

    rows = await readRows();
    expect(rows.rows[0]).toMatchObject({
      status: 'active',
      payouts_enabled: true,
      charges_enabled: true,
      transfers_capability: 'active',
      bank_name: 'Chase',
      last4: '6789',
    });

    // Capability state now satisfies the eligibility matrix for a USD shop.
    await seller.agent
      .put(financeUrl(seller.shopPublicId, 'payout-settings'))
      .set('Idempotency-Key', randomUUID())
      .send({ auto_payout_enabled: true })
      .expect(200);

    const audits = await sql.query<{ count: number }>(
      `select count(*)::int as count from "audit_logs"
       where "action" = 'finance.payout_account.synced' and "entity_id" = $1`,
      [rows.rows[0]!.id],
    );
    expect(audits.rows[0]!.count).toBe(1);

    // The same account state again changes nothing and writes no second audit.
    await sendAccountUpdated(connectAccount());
    const repeatedAudits = await sql.query<{ count: number }>(
      `select count(*)::int as count from "audit_logs"
       where "action" = 'finance.payout_account.synced' and "entity_id" = $1`,
      [rows.rows[0]!.id],
    );
    expect(repeatedAudits.rows[0]!.count).toBe(1);
  });

  it('shows requirements due as action_required and ignores an unknown account', async () => {
    await sendAccountUpdated(connectAccount({
      payoutsEnabled: false,
      transfersCapability: 'pending',
      requirementsDue: ['external_account'],
    }));

    const read = await seller.agent
      .get(financeUrl(seller.shopPublicId, 'payout-account'))
      .expect(200);
    expect(read.body.payout_account).toMatchObject({
      status: 'action_required',
      payouts_enabled: false,
      transfers_capability: 'pending',
      requirements: {
        currently_due: ['external_account'],
        disabled_reason: null,
      },
    });

    // Auto payouts are no longer eligible while requirements are due.
    const refused = await seller.agent
      .put(financeUrl(seller.shopPublicId, 'payout-settings'))
      .set('Idempotency-Key', randomUUID())
      .send({ auto_payout_enabled: true });
    expect(refused.status).toBe(409);

    const before = await readRows();
    await sendAccountUpdated(connectAccount({
      id: 'acct_unknown_environment',
      payoutsEnabled: true,
    }));

    const after = await readRows();
    expect(after.rows).toHaveLength(before.rows.length);
    expect(after.rows.map((row) => row.id)).toEqual(before.rows.map((row) => row.id));
    expect(after.rows[0]).toMatchObject({ status: 'action_required' });
  });

  it('stores a disabled reason as restricted', async () => {
    await sendAccountUpdated(connectAccount({
      payoutsEnabled: false,
      transfersCapability: 'inactive',
      requirementsDue: ['external_account'],
      disabledReason: 'requirements.past_due',
    }));

    const read = await seller.agent
      .get(financeUrl(seller.shopPublicId, 'payout-account'))
      .expect(200);
    expect(read.body.payout_account).toMatchObject({
      status: 'restricted',
      requirements: {
        currently_due: ['external_account'],
        disabled_reason: 'requirements.past_due',
      },
    });
  });

  it('lists only the configured Connect countries and refuses the rest', async () => {
    const countries = await seller.agent
      .get(financeUrl(seller.shopPublicId, 'payout-account/countries'))
      .expect(200);
    expect(countries.headers['cache-control']).toBe('private, no-cache');
    expect(countries.body).toEqual({ countries: ['GB', 'US'] });

    const callsBefore = connectGateway.createAccountCalls.length;
    const refused = await seller.agent
      .post(financeUrl(seller.shopPublicId, 'payout-account/onboarding'))
      .set('Idempotency-Key', randomUUID())
      .send({ country: 'VN' });

    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('PAYOUT_ACCOUNT_COUNTRY_UNSUPPORTED');
    expect(connectGateway.createAccountCalls).toHaveLength(callsBefore);
  });

  it('refuses cross-border payout regions Stripe cannot pay and accepts the ones it can', async () => {
    const fresh = await registerSeller('connect-region');
    const callsBefore = connectGateway.createAccountCalls.length;

    for (const country of ['AU', 'JP', 'SG']) {
      const refused = await fresh.agent
        .post(financeUrl(fresh.shopPublicId, 'payout-account/onboarding'))
        .set('Idempotency-Key', randomUUID())
        .send({ country });

      expect(refused.status).toBe(400);
      expect(refused.body.code).toBe('PAYOUT_ACCOUNT_COUNTRY_UNSUPPORTED');
    }

    // The refusal happens before the provider is asked for an account.
    expect(connectGateway.createAccountCalls).toHaveLength(callsBefore);

    const accepted = await fresh.agent
      .post(financeUrl(fresh.shopPublicId, 'payout-account/onboarding'))
      .set('Idempotency-Key', randomUUID())
      .send({ country: 'GB' })
      .expect(200);

    expect(accepted.body.status).toBe('onboarding');
    expect(connectGateway.createAccountCalls).toHaveLength(callsBefore + 1);
    expect(connectGateway.createAccountCalls.at(-1)).toEqual({
      country: 'GB',
      email: fresh.email,
    });
  });

  it('clears bank details when the account no longer carries one', async () => {
    await sendAccountUpdated(connectAccount({
      payoutsEnabled: true,
      transfersCapability: 'active',
      requirementsDue: [],
      disabledReason: null,
      externalAccount: null,
    }));

    const read = await seller.agent
      .get(financeUrl(seller.shopPublicId, 'payout-account'))
      .expect(200);
    expect(read.body.payout_account).toMatchObject({
      status: 'active',
      bank_name: null,
      last4: null,
    });

    const rows = await readRows();
    expect(rows.rows[0]).toMatchObject({ bank_name: null, last4: null });
  });
});
