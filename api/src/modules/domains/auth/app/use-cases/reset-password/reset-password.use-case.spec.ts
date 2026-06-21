import type { AuthSessionRepository } from '../../ports/auth-session.repository';
import type { AuthUserRepository } from '../../ports/auth-user.repository';
import type { PasswordHasher } from '../../ports/password-hasher';
import type { PasswordResetTokenRepository } from '../../ports/password-reset-token.repository';
import type { TokenHasher } from '../../ports/token-hasher';
import type { IssueSessionUseCase } from '../issue-session/issue-session.use-case';
import {
  InvalidPasswordResetTokenError,
  PasswordResetTokenExpiredError,
} from '../../errors/auth-app.error';
import { UserStatus } from '../../../domain/enums/user-status.enum';
import { Email } from '../../../domain/value-objects/email';
import { RoleKey } from '../../../domain/value-objects/role-key';
import { ResetPasswordUseCase } from './reset-password.use-case';

describe('ResetPasswordUseCase', () => {
  it('updates the password, revokes sessions, consumes the token, and issues a new session', async () => {
    const authUserRepository: jest.Mocked<AuthUserRepository> = {
      findByEmail: jest.fn(),
      findById: jest.fn().mockResolvedValue({
        id: 'user-1',
        version: 1,
        email: Email.create('member@example.com'),
        displayName: 'Member User',
        status: UserStatus.ACTIVE,
        roles: [RoleKey.create('customer')],
        permissions: [],
      }),
      create: jest.fn(),
      update: jest.fn(),
      updatePassword: jest.fn().mockResolvedValue(undefined),
      assignRole: jest.fn(),
      ensureRole: jest.fn(),
    };
    const authSessionRepository: jest.Mocked<AuthSessionRepository> = {
      findById: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      revokeAllForUser: jest.fn().mockResolvedValue(undefined),
    };
    const passwordResetTokenRepository: jest.Mocked<PasswordResetTokenRepository> = {
      create: jest.fn(),
      findByTokenHash: jest.fn().mockResolvedValue({
        id: 'token-1',
        userId: 'user-1',
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 10_000),
      }),
      save: jest.fn().mockResolvedValue(undefined),
      invalidateActiveTokensForUser: jest.fn(),
    };
    const passwordHasher: jest.Mocked<PasswordHasher> = {
      hash: jest
        .fn()
        .mockResolvedValue(
          '$2b$04$123456789012345678901u8QTs4lJx0pK7ydjXfQ6PS/UPTzQ0zQG',
        ),
      matches: jest.fn(),
    };
    const tokenHasher: jest.Mocked<TokenHasher> = {
      hash: jest.fn().mockReturnValue('hashed-token'),
    };
    const issueSessionUseCase: jest.Mocked<IssueSessionUseCase> = {
      execute: jest.fn().mockResolvedValue({
        isOk: true,
        value: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          user: {
            id: 'user-1',
            email: 'member@example.com',
            displayName: 'Member User',
            status: UserStatus.ACTIVE,
            sessionId: 'session-1',
            roles: ['customer'],
            permissions: [],
          },
        },
      }),
    } as unknown as jest.Mocked<IssueSessionUseCase>;
    const useCase = new ResetPasswordUseCase(
      authUserRepository,
      authSessionRepository,
      passwordResetTokenRepository,
      passwordHasher,
      tokenHasher,
      issueSessionUseCase,
    );

    const result = await useCase.execute({
      token: 'raw-token',
      password: 'new-password-123',
    });

    expect(result.isOk).toBe(true);
    expect(authUserRepository.updatePassword).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        passwordHash: expect.objectContaining({
          toString: expect.any(Function),
        }),
        passwordUpdatedAt: expect.any(Date),
      }),
    );
    expect(authSessionRepository.revokeAllForUser).toHaveBeenCalledWith('user-1');
    expect(passwordResetTokenRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'token-1',
        usedAt: expect.any(Date),
      }),
    );
  });

  it('rejects an invalid token', async () => {
    const authUserRepository = {} as jest.Mocked<AuthUserRepository>;
    const authSessionRepository = {} as jest.Mocked<AuthSessionRepository>;
    const passwordResetTokenRepository: jest.Mocked<PasswordResetTokenRepository> = {
      create: jest.fn(),
      findByTokenHash: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      invalidateActiveTokensForUser: jest.fn(),
    };
    const passwordHasher = {} as jest.Mocked<PasswordHasher>;
    const tokenHasher: jest.Mocked<TokenHasher> = {
      hash: jest.fn().mockReturnValue('hashed-token'),
    };
    const issueSessionUseCase = {} as jest.Mocked<IssueSessionUseCase>;
    const useCase = new ResetPasswordUseCase(
      authUserRepository,
      authSessionRepository,
      passwordResetTokenRepository,
      passwordHasher,
      tokenHasher,
      issueSessionUseCase,
    );

    const result = await useCase.execute({
      token: 'raw-token',
      password: 'new-password-123',
    });

    expect(result.isOk).toBe(false);
    if (result.isOk) {
      throw new Error('Expected reset password to fail');
    }
    expect(result.error).toBeInstanceOf(InvalidPasswordResetTokenError);
  });

  it('rejects an expired token', async () => {
    const authUserRepository = {} as jest.Mocked<AuthUserRepository>;
    const authSessionRepository = {} as jest.Mocked<AuthSessionRepository>;
    const passwordResetTokenRepository: jest.Mocked<PasswordResetTokenRepository> = {
      create: jest.fn(),
      findByTokenHash: jest.fn().mockResolvedValue({
        id: 'token-1',
        userId: 'user-1',
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() - 10_000),
      }),
      save: jest.fn(),
      invalidateActiveTokensForUser: jest.fn(),
    };
    const passwordHasher = {} as jest.Mocked<PasswordHasher>;
    const tokenHasher: jest.Mocked<TokenHasher> = {
      hash: jest.fn().mockReturnValue('hashed-token'),
    };
    const issueSessionUseCase = {} as jest.Mocked<IssueSessionUseCase>;
    const useCase = new ResetPasswordUseCase(
      authUserRepository,
      authSessionRepository,
      passwordResetTokenRepository,
      passwordHasher,
      tokenHasher,
      issueSessionUseCase,
    );

    const result = await useCase.execute({
      token: 'raw-token',
      password: 'new-password-123',
    });

    expect(result.isOk).toBe(false);
    if (result.isOk) {
      throw new Error('Expected reset password to fail');
    }
    expect(result.error).toBeInstanceOf(PasswordResetTokenExpiredError);
  });
});
