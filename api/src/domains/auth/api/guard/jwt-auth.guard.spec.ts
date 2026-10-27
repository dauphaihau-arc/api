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
import { IdempotencyKeyInterceptor } from '~/platform/idempotency/idempotency-key.interceptor';
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
import {
  InactiveUserError,
  InvalidRefreshTokenError,
  RefreshSessionInactiveError,
  RefreshSessionNotFoundError,
  RefreshTokenMismatchError,
  SessionNotActiveError,
  UserNotFoundError,
} from '../../app/errors/auth-app.error';
import type { AuthenticatedUser, UserProfile } from '../../app/auth.types';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { AuthCookieService } from '../rest/cookies/auth-cookie.service';
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
  const refreshSession = { execute: jest.fn() };
  const login = { execute: jest.fn() };
  const logout = { execute: jest.fn() };
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
        { provide: LoginUseCase, useValue: login },
        { provide: RefreshSessionUseCase, useValue: refreshSession },
        { provide: LogoutUseCase, useValue: logout },
        { provide: RequestPasswordResetUseCase, useValue: unusedUseCase },
        { provide: VerifyResetPasswordTokenUseCase, useValue: unusedUseCase },
        { provide: ResetPasswordUseCase, useValue: unusedUseCase },
        AuthCookieService,
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
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    refreshSession.execute.mockReset();
    login.execute.mockReset();
    logout.execute.mockReset();
    logout.execute.mockResolvedValue(undefined);
    loadAuthenticatedUser.execute.mockResolvedValue(ok(authenticatedUser));
    getCurrentUser.execute.mockResolvedValue(userProfile);
  });

  it.each([
    new InvalidRefreshTokenError(),
    new RefreshSessionNotFoundError(),
    new RefreshSessionInactiveError(),
    new RefreshTokenMismatchError(),
    new UserNotFoundError(),
    new InactiveUserError(),
  ])('expires both cookies when refresh rejects with %s', async (error) => {
    refreshSession.execute.mockResolvedValueOnce(ok({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
    }));
    const browser = request.agent(app.getHttpServer());
    await browser.post('/auth/refresh').expect(204);
    refreshSession.execute.mockResolvedValueOnce(err(error));
    const response = await browser.post('/auth/refresh');

    expect(response.status).toBe(error instanceof InactiveUserError ? 403 : 401);
    expect(response.headers['set-cookie']).toEqual([
      expect.stringContaining('accessToken=; Path=/; Expires=Thu, 01 Jan 1970'),
      expect.stringContaining('refreshToken=; Path=/; Expires=Thu, 01 Jan 1970'),
    ]);
    const currentUser = await browser.get('/auth/me');
    expect(currentUser.body).toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('preserves cookies when refresh fails due to infrastructure', async () => {
    refreshSession.execute.mockRejectedValueOnce(new Error('Database unavailable'));
    const response = await request(app.getHttpServer()).post('/auth/refresh')
      .set('Cookie', 'refreshToken=valid');

    expect(response.status).toBe(500);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('rotates both cookies on successful refresh', async () => {
    refreshSession.execute.mockResolvedValueOnce(ok({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    }));
    const response = await request(app.getHttpServer()).post('/auth/refresh')
      .set('Cookie', 'refreshToken=valid');

    expect(response.status).toBe(204);
    expect(response.headers['set-cookie']).toEqual([
      expect.stringContaining('accessToken=new-access;'),
      expect.stringContaining('refreshToken=new-refresh;'),
    ]);
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
    expect(response.body.code).toBe('SESSION_NOT_ACTIVE');
  });

  it('accepts a valid access token and exposes the authenticated user', async () => {
    const response = await requestWithCookies([`accessToken=${validAccessToken}`]);

    expect(response.status).toBe(200);
    expect(response.body.email).toBe('member@example.com');
  });

  it('sets only the admin cookie pair when logging in to the admin portal', async () => {
    login.execute.mockResolvedValueOnce(
      ok({
        accessToken: 'admin-access',
        refreshToken: 'admin-refresh',
        user: userProfile,
      }),
    );

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'Str0ng!Pass',
        app: 'admin',
      });

    expect(response.status).toBe(200);
    expect(response.headers['set-cookie']).toEqual([
      expect.stringContaining('adminAccessToken=admin-access;'),
      expect.stringContaining('adminRefreshToken=admin-refresh;'),
    ]);
  });

  it('keeps the legacy cookie pair for seller login', async () => {
    login.execute.mockResolvedValueOnce(
      ok({
        accessToken: 'seller-access',
        refreshToken: 'seller-refresh',
        user: userProfile,
      }),
    );

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'seller@example.com',
        password: 'Str0ng!Pass',
        app: 'seller',
      });

    expect(response.status).toBe(200);
    expect(response.headers['set-cookie']).toEqual([
      expect.stringContaining('accessToken=seller-access;'),
      expect.stringContaining('refreshToken=seller-refresh;'),
    ]);
  });

  it('rotates only the admin cookie pair on admin refresh', async () => {
    refreshSession.execute.mockResolvedValueOnce(
      ok({ accessToken: 'admin-access-2', refreshToken: 'admin-refresh-2' }),
    );

    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', 'adminRefreshToken=valid')
      .set('x-auth-portal', 'admin');

    expect(response.status).toBe(204);
    expect(refreshSession.execute).toHaveBeenCalledWith('valid');
    expect(response.headers['set-cookie']).toEqual([
      expect.stringContaining('adminAccessToken=admin-access-2;'),
      expect.stringContaining('adminRefreshToken=admin-refresh-2;'),
    ]);
  });

  it('clears only the admin cookie pair when admin refresh is rejected', async () => {
    refreshSession.execute.mockResolvedValueOnce(err(new InvalidRefreshTokenError()));

    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', 'adminRefreshToken=valid')
      .set('x-auth-portal', 'admin');

    expect(response.status).toBe(401);
    expect(response.headers['set-cookie']).toEqual([
      expect.stringContaining(
        'adminAccessToken=; Path=/; Expires=Thu, 01 Jan 1970',
      ),
      expect.stringContaining(
        'adminRefreshToken=; Path=/; Expires=Thu, 01 Jan 1970',
      ),
    ]);
  });

  it('never falls back from the legacy pair to the admin pair on refresh', async () => {
    refreshSession.execute.mockResolvedValueOnce(err(new InvalidRefreshTokenError()));

    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', 'adminRefreshToken=valid');

    expect(refreshSession.execute).toHaveBeenCalledWith('');
    expect(response.headers['set-cookie']).toEqual([
      expect.stringContaining('accessToken=; Path=/; Expires=Thu, 01 Jan 1970'),
      expect.stringContaining('refreshToken=; Path=/; Expires=Thu, 01 Jan 1970'),
    ]);
  });

  it('clears only the admin cookie pair on admin logout', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/logout')
      .set(
        'Cookie',
        `adminAccessToken=${validAccessToken}; adminRefreshToken=refresh-1`,
      )
      .set('x-auth-portal', 'admin');

    expect(response.status).toBe(204);
    expect(logout.execute).toHaveBeenCalledWith(authenticatedUser);
    expect(response.headers['set-cookie']).toEqual([
      expect.stringContaining(
        'adminAccessToken=; Path=/; Expires=Thu, 01 Jan 1970',
      ),
      expect.stringContaining(
        'adminRefreshToken=; Path=/; Expires=Thu, 01 Jan 1970',
      ),
    ]);
  });

  it('extracts the admin access cookie when the admin portal header is present', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', `adminAccessToken=${validAccessToken}`)
      .set('x-auth-portal', 'admin');

    expect(response.status).toBe(200);
    expect(response.body.email).toBe('member@example.com');
  });

  it('ignores the admin access cookie without the admin portal header', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', `adminAccessToken=${validAccessToken}`);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('classifies admin cookie errors using the admin pair names', async () => {
    const missing = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', 'adminRefreshToken=refresh-1')
      .set('x-auth-portal', 'admin');

    expect(missing.status).toBe(401);
    expect(missing.body).toMatchObject({ code: 'ACCESS_TOKEN_MISSING' });

    const legacyIgnored = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', `accessToken=${expiredAccessToken}; refreshToken=refresh-1`)
      .set('x-auth-portal', 'admin');

    expect(legacyIgnored.status).toBe(401);
    expect(legacyIgnored.body).toMatchObject({ code: 'AUTH_REQUIRED' });
  });
});
