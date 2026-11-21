import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import request from 'supertest';
import type { Agent } from 'supertest';
import type { App } from 'supertest/types';
import type * as BootstrapAppModule from '~/bootstrap/app.module';
import { GlobalExceptionFilter } from '~/platform/filters/global-exception.filter';
import { validationExceptionFactory } from '~/platform/pipes/validation-exception.factory';
import { RequestLoggingInterceptor } from '~/platform/logging/request-logging.interceptor';
import { ObservabilityService } from '~/platform/observability/observability.service';
import { RequestContextService } from '~/platform/request-context/request-context.service';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { LocalFileStorageService } from '~/integrations/storage/infra/local-file-storage.service';
import {
  createTestDatabase,
  dropTestDatabase,
  type TestDatabaseContext,
} from '../support/test-postgres';

jest.setTimeout(240_000);

const API_PREFIX = '/v1';
const VALID_TEST_PASSWORD = 'Password123!';

type ApiNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
};

type StoredNotification = {
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

function randomForwardedIp() {
  return `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
}

describe('Outbound messages notification reads (integration)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let storageRoot: string;
  let testDb: TestDatabaseContext;
  let sql: Client;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase('outbound_messages_int');
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-outbound-int-'));

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

    // Load module configuration only after selecting isolated test services.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('~/bootstrap/app.module') as typeof BootstrapAppModule;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(
        new LocalFileStorageService({
          driver: 'local',
          localRoot: storageRoot,
        }),
      )
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
      new GlobalExceptionFilter(
        app.get(RequestContextService),
        exceptionLogger,
      ),
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

  async function register(
    prefix: string,
    language: 'en' | 'vi',
  ): Promise<{ agent: Agent; userId: string }> {
    const agent = request.agent(app.getHttpServer());
    const email = `${prefix}-${randomUUID()}@example.com`;
    const response = await agent
      .post(`${API_PREFIX}/auth/register`)
      .set('Idempotency-Key', randomUUID())
      .set('X-Forwarded-For', randomForwardedIp())
      .send({
        email,
        password: VALID_TEST_PASSWORD,
        displayName: `${prefix} user`,
        preferences: { language },
      })
      .expect(201);

    return {
      agent,
      userId: response.body.user.id as string,
    };
  }

  async function insertNotification(
    userId: string,
    notification: StoredNotification,
  ): Promise<void> {
    await sql.query(
      `insert into "notifications"
         ("id", "user_id", "type", "channel", "title", "body", "data",
          "read_at", "created_at", "updated_at")
       values ($1, $2, $3, 'in_app', $4, $5, $6::jsonb, null, now(), now())`,
      [
        randomUUID(),
        userId,
        notification.type,
        notification.title,
        notification.body,
        notification.data ? JSON.stringify(notification.data) : null,
      ],
    );
  }

  async function updatePreference(userId: string, language: 'en' | 'vi') {
    await sql.query(
      `update "user_preferences"
       set "language" = $1, "updated_at" = now()
       where "user_id" = $2`,
      [language, userId],
    );
  }

  async function assignSellerRole(userId: string): Promise<void> {
    const existing = await sql.query<{ id: string }>(
      'select "id" from "roles" where "key" = $1',
      ['seller'],
    );
    const roleId = existing.rows[0]?.id ?? randomUUID();

    if (existing.rows.length === 0) {
      await sql.query(
        `insert into "roles"
           ("id", "created_at", "updated_at", "key", "name", "description")
         values ($1, now(), now(), 'seller', 'Seller', null)`,
        [roleId],
      );
    }

    await sql.query(
      `insert into "user_roles"
         ("id", "created_at", "updated_at", "assigned_at", "user_id", "role_id")
       values ($1, now(), now(), now(), $2, $3)`,
      [randomUUID(), userId, roleId],
    );
  }

  async function listNotifications(agent: Agent): Promise<ApiNotification[]> {
    const response = await agent
      .get(`${API_PREFIX}/me/notifications`)
      .set('X-Forwarded-For', randomForwardedIp())
      .expect(200);

    return response.body.results as ApiNotification[];
  }

  async function readStoredRows(userId: string) {
    const result = await sql.query<{
      type: string;
      title: string;
      body: string;
      data: Record<string, unknown> | null;
    }>(
      `select "type", "title", "body", "data"
       from "notifications"
       where "user_id" = $1
       order by "title"`,
      [userId],
    );

    return result.rows;
  }

  function byStoredTitle(
    notifications: ApiNotification[],
    title: string,
  ): ApiNotification {
    const notification = notifications.find((item) => item.title === title);

    expect(notification).toBeDefined();

    return notification!;
  }

  const buyerRows: StoredNotification[] = [
    {
      type: 'order.canceled',
      title: 'Order canceled',
      body: 'Order ORD-VI-1 was canceled.',
      data: { orderNumber: 'ORD-VI-1' },
    },
    {
      type: 'order.fulfillment.updated',
      title: 'Order updated',
      body: 'Order ORD-VI-2 was updated.',
      data: { orderNumber: 'ORD-VI-2' },
    },
    {
      type: 'order.shipment.updated',
      title: 'Shipment updated',
      body: 'Shipment for order ORD-VI-3 was updated.',
      data: { orderNumber: 'ORD-VI-3' },
    },
    {
      type: 'legacy.mystery.event',
      title: 'Legacy stored title',
      body: 'Legacy stored body',
      data: { legacy: true },
    },
    {
      type: 'order.canceled',
      title: 'Stored cancel without order number',
      body: 'Stored cancel body without order number',
      data: {},
    },
  ];

  it('localizes known buyer notifications using the current Vietnamese preference', async () => {
    const buyer = await register('outbound-buyer-vi', 'vi');

    for (const row of buyerRows) {
      await insertNotification(buyer.userId, row);
    }

    const notifications = await listNotifications(buyer.agent);

    expect(notifications).toHaveLength(buyerRows.length);
    expect(byStoredTitle(notifications, 'Đơn hàng đã hủy')).toEqual(
      expect.objectContaining({
        type: 'order.canceled',
        body: 'Đơn hàng ORD-VI-1 đã bị hủy.',
      }),
    );
    expect(byStoredTitle(notifications, 'Đơn hàng đã cập nhật')).toEqual(
      expect.objectContaining({
        type: 'order.fulfillment.updated',
        body: 'Đơn hàng ORD-VI-2 đã được cập nhật.',
      }),
    );
    expect(byStoredTitle(notifications, 'Vận chuyển đã cập nhật')).toEqual(
      expect.objectContaining({
        type: 'order.shipment.updated',
        body: 'Thông tin vận chuyển của đơn hàng ORD-VI-3 đã được cập nhật.',
      }),
    );
    expect(byStoredTitle(notifications, 'Legacy stored title')).toEqual(
      expect.objectContaining({
        type: 'legacy.mystery.event',
        body: 'Legacy stored body',
      }),
    );
    expect(
      byStoredTitle(notifications, 'Stored cancel without order number'),
    ).toEqual(expect.objectContaining({
      type: 'order.canceled',
      body: 'Stored cancel body without order number',
    }));
  });

  it('rerenders the same rows in English after the preference changes without touching storage', async () => {
    const buyer = await register('outbound-buyer-switch', 'vi');

    for (const row of buyerRows) {
      await insertNotification(buyer.userId, row);
    }

    const vietnamese = await listNotifications(buyer.agent);
    expect(vietnamese.some((item) => item.title === 'Đơn hàng đã hủy'))
      .toBe(true);
    const storedBefore = await readStoredRows(buyer.userId);

    await updatePreference(buyer.userId, 'en');

    const english = await listNotifications(buyer.agent);

    expect(byStoredTitle(english, 'Order canceled')).toEqual(
      expect.objectContaining({
        type: 'order.canceled',
        body: 'Order ORD-VI-1 was canceled.',
      }),
    );
    expect(byStoredTitle(english, 'Order updated')).toEqual(
      expect.objectContaining({
        type: 'order.fulfillment.updated',
        body: 'Order ORD-VI-2 was updated.',
      }),
    );
    expect(byStoredTitle(english, 'Shipment updated')).toEqual(
      expect.objectContaining({
        type: 'order.shipment.updated',
        body: 'Shipment for order ORD-VI-3 was updated.',
      }),
    );
    expect(byStoredTitle(english, 'Legacy stored title')).toEqual(
      expect.objectContaining({
        type: 'legacy.mystery.event',
        body: 'Legacy stored body',
      }),
    );
    expect(
      byStoredTitle(english, 'Stored cancel without order number'),
    ).toEqual(expect.objectContaining({
      type: 'order.canceled',
      body: 'Stored cancel body without order number',
    }));

    expect(await readStoredRows(buyer.userId)).toEqual(storedBefore);
  });

  it('keeps seller notifications stored in English even with a Vietnamese preference', async () => {
    const seller = await register('outbound-seller', 'en');
    await updatePreference(seller.userId, 'vi');
    await assignSellerRole(seller.userId);
    await insertNotification(seller.userId, {
      type: 'order.canceled',
      title: 'Seller stored title',
      body: 'Seller stored body',
      data: { orderNumber: 'ORD-SELLER-1' },
    });

    const notifications = await listNotifications(seller.agent);

    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toEqual(expect.objectContaining({
      type: 'order.canceled',
      title: 'Seller stored title',
      body: 'Seller stored body',
    }));
  });
});

function restoreProcessEnv(originalEnv: NodeJS.ProcessEnv) {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }

  Object.assign(process.env, originalEnv);
}
