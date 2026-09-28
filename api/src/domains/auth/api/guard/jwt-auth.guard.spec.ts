import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import request from 'supertest';
import type { App } from 'supertest/types';
import { GlobalExceptionFilter } from '~/platform/filters/global-exception.filter';
import { AUTH_CONFIG } from '~/platform/config/auth.config';
import type { AuthConfig } from '~/platform/config/auth.config';
import { OPENAI_CONFIG } from '~/platform/config/openai.config';
import { err, ok } from '~/platform/application/result';
import { RequestContextService } from '~/platform/request-context/request-context.service';
import { IdempotencyKeyInterceptor } from '~/platform/interceptors/idempotency-key.interceptor';
import { JwtStrategy } from '../../infra/jwt.strategy';
import { LoadAuthenticatedUserUseCase } from '../../app/use-cases/load-authenticated-user/load-authenticated-user.use-case';
import { GetCurrentUserUseCase } from '../../app/use-cases/get-current-user/get-current-user.use-case';
import { LoginUseCase } from '../../app/use-cases/login/login.use-case';
import { LogoutUseCase } from '../../app/use-cases/logout/logout.use-case';
import { RefreshSessionUseCase } from '../../app/use-cases/refresh-session/refresh-session.use-case';
import { RegisterUseCase } from '../../app/use-cases/register/register.use-case';
import { RequestPasswordResetUseCase } from '../../app/use-cases/request-password-reset/request-password-reset.use-case';
import { ResetPasswordUseCase } from '../../app/use-cases/reset-password/reset-password.use-case';
import { VerifyResetPasswordTokenUseCase } from '../../app/use-cases/verify-reset-password-token/verify-reset-password-token.use-case';
import { SessionNotActiveError } from '../../app/errors/auth-app.error';
import type { AuthenticatedUser, UserProfile } from '../../app/auth.types';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { AuthCookieService } from '../rest/auth-cookie.utils';
import { AuthController } from '../rest/auth.controller';

const authConfig: AuthConfig = {
  jwtAccessSecret: 'test-access-secret',
  jwtAccessTtlSeconds: 900,
  jwtRefreshSecret: 'test-refresh-secret',
  jwtRefreshTtlSeconds: 604_800,
  accessCookieName: 'accessToken',
  refreshCookieName: 'refreshToken',
  cookiePath: '/',
  cookieSameSite: 'lax',
  cookieSecure: false,
  bcryptSaltRounds: 4,
};

const authenticatedUser: AuthenticatedUser = {
  userId: 'user-1',
  email: 'member@example.com',
  displayName: 'Member',
  status: UserStatus.ACTIVE,
  sessionId: 'session-1',
  roles: [],
  permissions: [],
};

const userProfile: UserProfile = {
  id: 'user-1',
  email: 'member@example.com',
  displayName: 'Member',
  status: UserStatus.ACTIVE,
  sessionId: 'session-1',
  roles: [],
  permissions: [],
};

describe('JwtAuthGuard token error contract through AuthController', () => {
  let app: INestApplication<App>;
  const loadAuthenticatedUser = { execute: jest.fn() };
  const getCurrentUser = { execute: jest.fn() };
  const unusedUseCase = { execute: jest.fn() };
  const jwtService = new JwtService({ secret: authConfig.jwtAccessSecret });

  const validAccessToken = jwtService.sign(
    { sub: 'user-1', sessionId: 'session-1' },
    { expiresIn: '5m' },
  );
  const expiredAccessToken = jwtService.sign(
    { sub: 'user-1', sessionId: 'session-1' },
    { expiresIn: '-5s' },
  );
  const badSignatureAccessToken = jwtService.sign(
    { sub: 'user-1', sessionId: 'session-1' },
    { secret: 'other-secret', expiresIn: '5m' },
  );

  const requestWithCookies = (cookies: string[]) =>
    request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookies.join('; '));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [AuthController],
      providers: [
        { provide: AUTH_CONFIG, useValue: authConfig },
        { provide: OPENAI_CONFIG, useValue: {} },
        JwtStrategy,
        { provide: LoadAuthenticatedUserUseCase, useValue: loadAuthenticatedUser },
        { provide: GetCurrentUserUseCase, useValue: getCurrentUser },
        { provide: RegisterUseCase, useValue: unusedUseCase },
        { provide: LoginUseCase, useValue: unusedUseCase },
        { provide: RefreshSessionUseCase, useValue: unusedUseCase },
        { provide: LogoutUseCase, useValue: unusedUseCase },
        { provide: RequestPasswordResetUseCase, useValue: unusedUseCase },
        { provide: VerifyResetPasswordTokenUseCase, useValue: unusedUseCase },
        { provide: ResetPasswordUseCase, useValue: unusedUseCase },
        {
          provide: AuthCookieService,
          useValue: { setAuthCookies: jest.fn(), clearAuthCookies: jest.fn() },
        },
        {
          provide: RequestContextService,
          useValue: { get: () => ({}), setAuthenticatedUser: jest.fn() },
        },
        { provide: PinoLogger, useValue: { error: jest.fn() } },
      ],
    })
      .overrideInterceptor(IdempotencyKeyInterceptor)
      .useValue({
        intercept: (_context: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(
      new GlobalExceptionFilter(app.get(RequestContextService), app.get(PinoLogger)),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    loadAuthenticatedUser.execute.mockResolvedValue(ok(authenticatedUser));
    getCurrentUser.execute.mockResolvedValue(userProfile);
  });

  it('classifies an expired access token as ACCESS_TOKEN_EXPIRED when a refresh cookie exists', async () => {
    const response = await requestWithCookies([
      `accessToken=${expiredAccessToken}`,
      'refreshToken=refresh-1',
    ]);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'ACCESS_TOKEN_EXPIRED' });
  });

  it('classifies a missing access token as ACCESS_TOKEN_MISSING when a refresh cookie exists', async () => {
    const response = await requestWithCookies(['refreshToken=refresh-1']);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'ACCESS_TOKEN_MISSING' });
  });

  it('classifies absent cookies as AUTH_REQUIRED', async () => {
    const response = await request(app.getHttpServer()).get('/auth/me');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('classifies a bad signature as ACCESS_TOKEN_INVALID', async () => {
    const response = await requestWithCookies([
      `accessToken=${badSignatureAccessToken}`,
      'refreshToken=refresh-1',
    ]);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'ACCESS_TOKEN_INVALID' });
  });

  it('classifies an expired access token without a refresh cookie as ACCESS_TOKEN_INVALID', async () => {
    const response = await requestWithCookies([`accessToken=${expiredAccessToken}`]);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'ACCESS_TOKEN_INVALID' });
  });

  it('preserves validation errors instead of classifying them as recoverable', async () => {
    loadAuthenticatedUser.execute.mockResolvedValue(err(new SessionNotActiveError()));

    const response = await requestWithCookies([
      `accessToken=${validAccessToken}`,
      'refreshToken=refresh-1',
    ]);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Session is not active');
    expect(response.body.code).toBeUndefined();
  });

  it('accepts a valid access token and exposes the authenticated user', async () => {
    const response = await requestWithCookies([`accessToken=${validAccessToken}`]);

    expect(response.status).toBe(200);
    expect(response.body.email).toBe('member@example.com');
  });
});
