import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EntityManager } from '@mikro-orm/postgresql';
import type { INestApplication } from '@nestjs/common';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import request from 'supertest';
import type { App } from 'supertest/types';
import { GlobalExceptionFilter } from '~/platform/filters/global-exception.filter';
import { RequestLoggingInterceptor } from '~/platform/interceptors/request-logging.interceptor';
import { parseCorsAllowedOrigins } from '~/platform/config/cors.config';
import type { AuthUserResponse } from '~/domains/auth/app/auth.types';
import { UserSessionEntity } from '~/domains/auth/infra/persistence/entities/user-session.entity';
import { AppModule } from '~/bootstrap/app.module';
import { ObservabilityService } from '~/platform/observability/observability.service';
import { RequestContextService } from '~/platform/request-context/request-context.service';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { LocalFileStorageService } from '~/integrations/storage/infra/local-file-storage.service';
import { createTestDatabase, dropTestDatabase } from '../support/test-postgres';

jest.setTimeout(30_000);

const API_PREFIX = '/v1';
const VALID_TEST_PASSWORD = 'Password123!';

function randomForwardedIp() {
  return `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
}

describe('Auth login (integration)', () => {
  let app: INestApplication<App>;
  let entityManager: EntityManager;
  let originalEnv: NodeJS.ProcessEnv;
  let storageRoot: string;
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase('auth_login_int');
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-auth-int-'));

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
    process.env.QUEUE_DRIVER = 'inline';
    process.env.MAIL_DRIVER = 'logger';
    process.env.STORAGE_DRIVER = 'local';
    process.env.STORAGE_LOCAL_ROOT = storageRoot;

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
    const corsAllowedOrigins = parseCorsAllowedOrigins(process.env);

    if (corsAllowedOrigins.length > 0) {
      app.enableCors({
        origin: corsAllowedOrigins,
        credentials: true,
      });
    }

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
    entityManager = app.get(EntityManager);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    if (storageRoot) {
      await rm(storageRoot, {
        recursive: true,
        force: true,
      });
    }

    restoreProcessEnv(originalEnv);

    if (testDb) {
      await dropTestDatabase(testDb);
    }
  });

  it('authenticates an existing user and rotates the session', async () => {
    const email = `login-${Date.now()}@example.com`;
    const agent = request.agent(app.getHttpServer());

    const registerResponse = await agent
      .post(`${API_PREFIX}/auth/register`)
      .set('X-Forwarded-For', randomForwardedIp())
      .send({
        email,
        password: VALID_TEST_PASSWORD,
        displayName: 'Login Test User',
      })
      .expect(201);
    const registerCookies = expectAuthCookies(
      registerResponse.headers['set-cookie'],
    );

    await agent
      .post(`${API_PREFIX}/auth/logout`)
      .set('X-Forwarded-For', randomForwardedIp())
      .expect(204);

    const loginResponse = await agent
      .post(`${API_PREFIX}/auth/login`)
      .set('X-Forwarded-For', randomForwardedIp())
      .send({
        email,
        password: VALID_TEST_PASSWORD,
        app: 'storefront',
      })
      .expect(200);
    const loginBody = loginResponse.body as unknown as AuthUserResponse;
    const loginCookies = expectAuthCookies(loginResponse.headers['set-cookie']);

    expect(loginResponse.headers['cache-control']).toBe('no-store');
    expect(loginBody.user.email).toBe(email);
    expect(loginCookies.refreshToken.value).not.toBe(
      registerCookies.refreshToken.value,
    );

    const sessions = await entityManager.fork().find(
      UserSessionEntity,
      { user: loginBody.user.id },
      { orderBy: { createdAt: 'asc' }, populate: ['user'] },
    );

    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.revokedAt).toEqual(expect.any(Date));
    expect(sessions[1]?.revokedAt ?? null).toBeNull();
    expect(sessions[1]?.user.id).toBe(loginBody.user.id);
  });

  it('rejects an invalid password without issuing auth cookies', async () => {
    const email = `login-fail-${Date.now()}@example.com`;

    await request(app.getHttpServer())
      .post(`${API_PREFIX}/auth/register`)
      .set('X-Forwarded-For', randomForwardedIp())
      .send({
        email,
        password: VALID_TEST_PASSWORD,
        displayName: 'Rejected Login User',
      })
      .expect(201);

    const loginResponse = await request(app.getHttpServer())
      .post(`${API_PREFIX}/auth/login`)
      .set('X-Forwarded-For', randomForwardedIp())
      .send({
        email,
        password: 'WrongPassword123!',
        app: 'storefront',
      })
      .expect(401);

    expect(loginResponse.headers['set-cookie']).toBeUndefined();
    expect(loginResponse.headers['cache-control']).toBe('no-store');
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

function expectAuthCookies(setCookieHeader: string | string[] | undefined) {
  expect(setCookieHeader).toBeDefined();
  const cookieHeaders = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : [setCookieHeader as string];
  const parsedCookies = cookieHeaders.map((value) => value.split(';')[0] ?? '');
  const accessToken = parsedCookies.find((value) => value.startsWith('accessToken='));
  const refreshToken = parsedCookies.find((value) => value.startsWith('refreshToken='));

  expect(accessToken).toBeDefined();
  expect(refreshToken).toBeDefined();

  return {
    accessToken: parseCookie(accessToken!),
    refreshToken: parseCookie(refreshToken!),
  };
}

function parseCookie(cookie: string) {
  const [name, value] = cookie.split('=');

  return { name, value };
}
