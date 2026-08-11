import type { AuthConfig } from '~/platform/config/auth.config';
import type { RequestContextService } from '~/platform/request-context/request-context.service';
import { UserStatus } from '../../../domain/enums/user-status.enum';
import type { UserAccount } from '../../../domain/models/user-account';
import type { UserSession } from '../../../domain/models/user-session';
import { Email } from '../../../domain/value-objects/email';
import { RoleKey } from '../../../domain/value-objects/role-key';
import type { AuthSessionRepository } from '../../ports/auth-session.repository';
import type { AuthTokenService } from '../../ports/auth-token.service';
import type { AuthUserRepository } from '../../ports/auth-user.repository';
import type { TokenHasher } from '../../ports/token-hasher';
import type { UserPreferenceRepository } from '../../ports/user-preference.repository';
import { IssueSessionUseCase } from './issue-session.use-case';

describe('IssueSessionUseCase', () => {
  it('returns user preferences in the auth response', async () => {
    const user: UserAccount = {
      id: 'user-1',
      version: 1,
      email: Email.create('member@example.com'),
      displayName: 'Member User',
      status: UserStatus.ACTIVE,
      roles: [RoleKey.create('customer')],
      permissions: [],
    };
    const session: UserSession = {
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: '',
      expiresAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const authUserRepository: jest.Mocked<AuthUserRepository> = {
      findByEmail: jest.fn(),
      findLoginByEmail: jest.fn(),
      findById: jest.fn().mockResolvedValue(user),
      create: jest.fn(),
      update: jest.fn(),
      updatePassword: jest.fn(),
      assignRole: jest.fn(),
      ensureRole: jest.fn(),
    };
    const authSessionRepository: jest.Mocked<AuthSessionRepository> = {
      findById: jest.fn(),
      create: jest.fn().mockResolvedValue(session),
      save: jest.fn().mockResolvedValue(undefined),
      revokeAllForUser: jest.fn(),
    };
    const authTokenService: jest.Mocked<AuthTokenService> = {
      issueAccessToken: jest.fn().mockResolvedValue('access-token'),
      issueRefreshToken: jest.fn().mockResolvedValue('refresh-token'),
      verifyAccessToken: jest.fn(),
      verifyRefreshToken: jest.fn(),
    };
    const tokenHasher: jest.Mocked<TokenHasher> = {
      hash: jest.fn().mockReturnValue('hashed-refresh-token'),
    };
    const userPreferenceRepository: jest.Mocked<UserPreferenceRepository> = {
      create: jest.fn(),
      save: jest.fn(),
      findByUserId: jest.fn().mockResolvedValue({
        region: 'United States',
        language: 'en',
        currency: 'USD',
      }),
    };
    const requestContextService: Pick<jest.Mocked<RequestContextService>, 'get' | 'setAuthenticatedUser'> = {
      get: jest.fn().mockReturnValue({
        userAgent: 'test-agent',
        ipAddress: '127.0.0.1',
      }),
      setAuthenticatedUser: jest.fn(),
    };
    const authConfig = {
      jwtRefreshTtlSeconds: 60,
    } as AuthConfig;
    const useCase = new IssueSessionUseCase(
      authUserRepository,
      authSessionRepository,
      authTokenService,
      tokenHasher,
      userPreferenceRepository,
      requestContextService as unknown as RequestContextService,
      authConfig,
    );

    const result = await useCase.execute('user-1');

    expect(result.isOk).toBe(true);
    expect(userPreferenceRepository.findByUserId).toHaveBeenCalledWith('user-1');
    if (result.isOk) {
      expect(result.value.user.preferences).toEqual({
        region: 'United States',
        language: 'en',
        currency: 'USD',
      });
    }
  });
});
