import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EntityManager } from '@mikro-orm/postgresql';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import request from 'supertest';
import type { App } from 'supertest/types';
import { GlobalExceptionFilter } from '~/platform/filters/global-exception.filter';
import { RequestLoggingInterceptor } from '~/platform/interceptors/request-logging.interceptor';
import { parseCorsAllowedOrigins } from '~/platform/config/cors.config';
import { UserPreferenceEntity } from '~/domains/auth/infra/persistence/entities/user-preference.entity';
import { ObservabilityService } from '~/platform/observability/observability.service';
import { RequestContextService } from '~/platform/request-context/request-context.service';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { LocalFileStorageService } from '~/integrations/storage/infra/local-file-storage.service';
import { createTestDatabase, dropTestDatabase } from '../support/test-postgres';

jest.setTimeout(30_000);

const API_PREFIX = '/v1';
const expectedMemberPermissions: string[] = [];
const VALID_TEST_PASSWORD = 'Password123!';
type AuthHttpResponseBody = {
  user: {
    id: string;
    email: string;
    display_name?: string;
    session_id: string;
    roles: string[];
    permissions: string[];
  };
};

type CurrentUserHttpResponseBody = {
  email: string;
  display_name?: string;
  permissions: string[];
};

describe('Auth flow (e2e)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let storageRoot: string;
  let entityManager: EntityManager;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase('auth');
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'api-auth-e2e-'));

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
    const { AppModule } = await import('~/bootstrap/app.module.js');

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

  it('registers, authenticates, refreshes, and revokes a session', async () => {
    const email = `member-${Date.now()}@example.com`;
    const agent = request.agent(app.getHttpServer());

    const registerResponse = await agent
      .post(`${API_PREFIX}/auth/register`)
      .send({
        email,
        password: VALID_TEST_PASSWORD,
        displayName: 'Member User',
        preferences: {
          region: 'Vietnam',
          language: 'fr',
          currency: 'EUR',
        },
      })
      .expect(201);
    const registerBody = registerResponse.body as AuthHttpResponseBody;
    const registerCookies = expectAuthCookies(registerResponse.headers['set-cookie']);

    expect(registerBody.user).toMatchObject({
      email,
      display_name: 'Member User',
      roles: ['member'],
      permissions: expectedMemberPermissions,
    });
    expect(registerResponse.headers['cache-control']).toBe('no-store');
    expect(registerBody.user.id).toEqual(expect.any(String));
    expect(registerBody.user.session_id).toEqual(expect.any(String));
    const userPreference = await entityManager.fork().findOne(
      UserPreferenceEntity,
      { user: registerBody.user.id },
      { populate: ['user'] },
    );

    expect(userPreference).toBeTruthy();
    expect(userPreference).toMatchObject({
      region: 'Vietnam',
      language: 'fr',
      currency: 'EUR',
    });

    const sessionId = registerBody.user.session_id;

    const meResponse = await agent
      .get(`${API_PREFIX}/auth/me`)
      .expect(200);
    const meBody = meResponse.body as CurrentUserHttpResponseBody;

    expect(meBody).toMatchObject({
      email,
      display_name: 'Member User',
      permissions: expectedMemberPermissions,
    });
    expect(meBody).not.toHaveProperty('session_id');
    expect(meBody).not.toHaveProperty('roles');
    expect(meResponse.headers['cache-control']).toBe('no-store');

    const loginResponse = await agent
      .post(`${API_PREFIX}/auth/login`)
      .send({
        email,
        password: VALID_TEST_PASSWORD,
      })
      .expect(200);
    const loginBody = loginResponse.body as AuthHttpResponseBody;
    const loginCookies = expectAuthCookies(loginResponse.headers['set-cookie']);

    expect(loginResponse.headers['cache-control']).toBe('no-store');
    expect(loginBody.user.email).toBe(email);
    expect(loginBody.user.session_id).not.toBe(sessionId);
    expect(loginCookies.refreshToken.value).not.toBe(
      registerCookies.refreshToken.value,
    );

    const refreshResponse = await agent
      .post(`${API_PREFIX}/auth/refresh`)
      .expect(204);
    const refreshCookies = expectAuthCookies(refreshResponse.headers['set-cookie']);

    expect(refreshResponse.headers['cache-control']).toBe('no-store');
    expect(refreshResponse.body).toEqual({});
    expect(refreshCookies.refreshToken.value).not.toBe(loginCookies.refreshToken.value);

    await request(app.getHttpServer())
      .post(`${API_PREFIX}/auth/refresh`)
      .set(
        'Cookie',
        `${loginCookies.refreshToken.name}=${loginCookies.refreshToken.value}`,
      )
      .expect(401);

    await agent
      .post(`${API_PREFIX}/auth/logout`)
      .expect(204);

    await agent
      .get(`${API_PREFIX}/auth/me`)
      .expect(401);
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
