import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EntityManager } from '@mikro-orm/postgresql';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import type { App } from 'supertest/types';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { RequestLoggingInterceptor } from '../src/common/interceptors/request-logging.interceptor';
import { parseCorsAllowedOrigins } from '../src/config/cors.config';
import type { AuthUserResponse, UserProfile } from '../src/modules/domains/auth/app/auth.types';
import { UserPreferenceEntity } from '../src/modules/domains/auth/infra/persistence/entities/user-preference.entity';
import { StorageService } from '../src/modules/shared/storage/app/ports/storage.service';
import { LocalFileStorageService } from '../src/modules/shared/storage/infra/local-file-storage.service';
import { createTestDatabase, dropTestDatabase } from './e2e-postgres';

jest.setTimeout(30_000);

const API_PREFIX = '/v1';
const expectedMemberPermissions: string[] = [];

describe('Auth flow (e2e)', () => {
  let app: INestApplication<App>;
  let originalEnv: NodeJS.ProcessEnv;
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let storageRoot: string;
  let entityManager: EntityManager;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase();
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
    process.env.STORAGE_DRIVER = 'local';
    process.env.STORAGE_LOCAL_ROOT = storageRoot;
    const { AppModule } = await import('../src/modules/app.module');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(
        new LocalFileStorageService({
          driver: 'local',
          localRoot: storageRoot,
        })
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
      })
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(
      new ClassSerializerInterceptor(app.get(Reflector)),
      new RequestLoggingInterceptor()
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
        password: 'password123',
        displayName: 'Member User',
        preferences: {
          region: 'Vietnam',
          language: 'fr',
          currency: 'EUR',
        },
      })
      .expect(201);
    const registerBody = registerResponse.body as unknown as AuthUserResponse;
    const registerCookies = expectAuthCookies(registerResponse.headers['set-cookie']);

    expect(registerBody.user).toMatchObject({
      email,
      displayName: 'Member User',
      roles: ['member'],
      permissions: expectedMemberPermissions,
    });
    expect(registerResponse.headers['cache-control']).toBe('no-store');
    expect(registerBody.user.id).toEqual(expect.any(String));
    expect(registerBody.user.sessionId).toEqual(expect.any(String));
    const userPreference = await entityManager.fork().findOne(
      UserPreferenceEntity,
      { user: registerBody.user.id },
      { populate: ['user'] }
    );

    expect(userPreference).toBeTruthy();
    expect(userPreference).toMatchObject({
      region: 'Vietnam',
      language: 'fr',
      currency: 'EUR',
    });

    const sessionId = registerBody.user.sessionId;

    const meResponse = await agent
      .get(`${API_PREFIX}/auth/me`)
      .expect(200);
    const meBody = meResponse.body as unknown as UserProfile;

    expect(meBody).toMatchObject({
      email,
      displayName: 'Member User',
      permissions: expectedMemberPermissions,
    });
    expect(meBody).not.toHaveProperty('sessionId');
    expect(meBody).not.toHaveProperty('roles');
    expect(meResponse.headers['cache-control']).toBe('no-store');

    const loginResponse = await agent
      .post(`${API_PREFIX}/auth/login`)
      .send({
        email,
        password: 'password123',
      })
      .expect(200);
    const loginBody = loginResponse.body as unknown as AuthUserResponse;
    const loginCookies = expectAuthCookies(loginResponse.headers['set-cookie']);

    expect(loginResponse.headers['cache-control']).toBe('no-store');
    expect(loginBody.user.email).toBe(email);
    expect(loginBody.user.sessionId).not.toBe(sessionId);
    expect(loginCookies.refreshToken.value).not.toBe(
      registerCookies.refreshToken.value
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
        `${loginCookies.refreshToken.name}=${loginCookies.refreshToken.value}`
      )
      .expect(401);

    const logoutResponse = await agent
      .post(`${API_PREFIX}/auth/logout`)
      .expect(204);
    const clearedCookies = expectAuthCookies(logoutResponse.headers['set-cookie']);

    expect(logoutResponse.headers['cache-control']).toBe('no-store');
    expect(clearedCookies.accessToken.raw).toContain(
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    );
    expect(clearedCookies.refreshToken.raw).toContain(
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    );

    await agent
      .get(`${API_PREFIX}/auth/me`)
      .expect(401);

    await agent
      .post(`${API_PREFIX}/auth/refresh`)
      .expect(401);
  });

  it('exposes a health endpoint under the v1 API prefix', async () => {
    const response = await request(app.getHttpServer())
      .get(`${API_PREFIX}/health`)
      .expect(200);
    const responseBody = response.body as unknown as {
      status: string;
      timestamp: string;
    };

    expect(responseBody.status).toBe('ok');
    expect(responseBody.timestamp).toEqual(expect.any(String));
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('creates default user preferences when register omits preferences', async () => {
    const email = `member-default-${Date.now()}@example.com`;

    const registerResponse = await request(app.getHttpServer())
      .post(`${API_PREFIX}/auth/register`)
      .send({
        email,
        password: 'password123',
        displayName: 'Default Member User',
      })
      .expect(201);
    const registerBody = registerResponse.body as unknown as AuthUserResponse;
    const userPreference = await entityManager.fork().findOne(
      UserPreferenceEntity,
      { user: registerBody.user.id },
      { populate: ['user'] }
    );

    expect(userPreference).toBeTruthy();
    expect(userPreference).toMatchObject({
      region: 'United States',
      language: 'en',
      currency: 'USD',
    });
  });

  it('applies stricter route-specific rate limits for register, login, and refresh', async () => {
    const registerIp = '203.0.113.10';
    const registerEmailPrefix = `rate-limit-register-${Date.now()}`;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/register`)
        .set('X-Forwarded-For', registerIp)
        .send({
          email: `${registerEmailPrefix}-${attempt}@example.com`,
          password: 'password123',
          displayName: `Register Attempt ${attempt + 1}`,
        })
        .expect(201);
    }

    const blockedRegisterResponse = await request(app.getHttpServer())
      .post(`${API_PREFIX}/auth/register`)
      .set('X-Forwarded-For', registerIp)
      .send({
        email: `${registerEmailPrefix}-blocked@example.com`,
        password: 'password123',
        displayName: 'Blocked Register Attempt',
      })
      .expect(429);

    expect(blockedRegisterResponse.body).toMatchObject({
      statusCode: 429,
      error: 'ThrottlerException',
      message: 'Too many requests.',
    });

    const loginIp = '203.0.113.11';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/login`)
        .set('X-Forwarded-For', loginIp)
        .send({
          email: 'missing-user@example.com',
          password: 'password123',
        })
        .expect(401);
    }

    const blockedLoginResponse = await request(app.getHttpServer())
      .post(`${API_PREFIX}/auth/login`)
      .set('X-Forwarded-For', loginIp)
      .send({
        email: 'missing-user@example.com',
        password: 'password123',
      })
      .expect(429);

    expect(blockedLoginResponse.body).toMatchObject({
      statusCode: 429,
      error: 'ThrottlerException',
      message: 'Too many requests.',
    });

    const refreshIp = '203.0.113.12';

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/refresh`)
        .set('X-Forwarded-For', refreshIp)
        .set('Cookie', 'refreshToken=invalid-refresh-token-value-1234567890')
        .expect(401);
    }

    const blockedRefreshResponse = await request(app.getHttpServer())
      .post(`${API_PREFIX}/auth/refresh`)
      .set('X-Forwarded-For', refreshIp)
      .set('Cookie', 'refreshToken=invalid-refresh-token-value-1234567890')
      .expect(429);

    expect(blockedRefreshResponse.body).toMatchObject({
      statusCode: 429,
      error: 'ThrottlerException',
      message: 'Too many requests.',
    });
  });
});

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

type CookieAssertion = {
  name: string;
  raw: string;
  value: string;
};

function expectAuthCookies(setCookieHeader?: string[]): {
  accessToken: CookieAssertion;
  refreshToken: CookieAssertion;
} {
  return {
    accessToken: parseCookieAssertion(setCookieHeader, 'accessToken'),
    refreshToken: parseCookieAssertion(setCookieHeader, 'refreshToken'),
  };
}

function parseCookieAssertion(
  setCookieHeader: string[] | undefined,
  cookieName: string
): CookieAssertion {
  const rawCookie = setCookieHeader?.find((cookie) =>
    cookie.startsWith(`${cookieName}=`)
  );

  expect(rawCookie).toBeDefined();

  const [nameValue] = rawCookie!.split(';');
  const separatorIndex = nameValue.indexOf('=');

  expect(rawCookie).toContain('HttpOnly');
  expect(rawCookie).toContain('Path=/');

  return {
    name: nameValue.slice(0, separatorIndex),
    raw: rawCookie!,
    value: nameValue.slice(separatorIndex + 1),
  };
}
