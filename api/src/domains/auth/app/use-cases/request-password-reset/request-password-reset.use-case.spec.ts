import type { ConfigService } from '@nestjs/config';
import type { AuthUserRepository } from '../../ports/auth-user.repository';
import type { PasswordResetTokenRepository } from '../../ports/password-reset-token.repository';
import type { TokenHasher } from '../../ports/token-hasher';
import type { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { UserStatus } from '../../../domain/enums/user-status.enum';
import { Email } from '../../../domain/value-objects/email';
import { RoleKey } from '../../../domain/value-objects/role-key';
import { RequestPasswordResetUseCase } from './request-password-reset.use-case';

describe('RequestPasswordResetUseCase', () => {
  it('creates a storefront reset token and queues an email when the user exists', async () => {
    const authUserRepository: jest.Mocked<AuthUserRepository> = {
      findByEmail: jest.fn().mockResolvedValue({
        id: 'user-1',
        version: 1,
        email: Email.create('member@example.com'),
        displayName: 'Member User',
        status: UserStatus.ACTIVE,
        roles: [RoleKey.create('customer')],
        permissions: [],
      }),
      findLoginByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updatePassword: jest.fn(),
      assignRole: jest.fn(),
      ensureRole: jest.fn(),
    };
    const passwordResetTokenRepository: jest.Mocked<PasswordResetTokenRepository> = {
      create: jest.fn().mockResolvedValue({
        id: 'token-1',
        userId: 'user-1',
        tokenHash: 'hashed-token',
        expiresAt: new Date('2026-01-01T01:00:00.000Z'),
      }),
      findByTokenHash: jest.fn(),
      save: jest.fn(),
      invalidateActiveTokensForUser: jest.fn().mockResolvedValue(undefined),
    };
    const tokenHasher: jest.Mocked<TokenHasher> = {
      hash: jest.fn().mockReturnValue('hashed-token'),
    };
    const jobDispatcher: jest.Mocked<JobDispatcher> = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'APP_BASE_URL') {
          return 'http://localhost:4001';
        }

        if (key === 'SELLER_APP_BASE_URL') {
          return 'http://localhost:4002';
        }

        return undefined;
      }),
    };
    const useCase = new RequestPasswordResetUseCase(
      authUserRepository,
      passwordResetTokenRepository,
      tokenHasher,
      jobDispatcher,
      configService as unknown as ConfigService,
    );

    await useCase.execute('member@example.com', 'storefront');

    expect(passwordResetTokenRepository.invalidateActiveTokensForUser).toHaveBeenCalledWith(
      'user-1',
    );
    expect(passwordResetTokenRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        tokenHash: 'hashed-token',
        expiresAt: expect.any(Date),
      }),
    );
    expect(jobDispatcher.dispatch).toHaveBeenCalledWith(
      'user.send-password-reset-email',
      expect.objectContaining({
        userId: 'user-1',
        email: 'member@example.com',
        displayName: 'Member User',
        resetUrl: expect.stringMatching(
          /^http:\/\/localhost:4001\/reset\?t=/,
        ),
      }),
    );
  });

  it('creates a seller reset token with the seller app URL', async () => {
    const authUserRepository: jest.Mocked<AuthUserRepository> = {
      findByEmail: jest.fn().mockResolvedValue({
        id: 'user-1',
        version: 1,
        email: Email.create('seller@example.com'),
        displayName: 'Seller User',
        status: UserStatus.ACTIVE,
        roles: [RoleKey.create('seller')],
        permissions: [],
      }),
      findLoginByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updatePassword: jest.fn(),
      assignRole: jest.fn(),
      ensureRole: jest.fn(),
    };
    const passwordResetTokenRepository: jest.Mocked<PasswordResetTokenRepository> = {
      create: jest.fn().mockResolvedValue({
        id: 'token-1',
        userId: 'user-1',
        tokenHash: 'hashed-token',
        expiresAt: new Date('2026-01-01T01:00:00.000Z'),
      }),
      findByTokenHash: jest.fn(),
      save: jest.fn(),
      invalidateActiveTokensForUser: jest.fn().mockResolvedValue(undefined),
    };
    const tokenHasher: jest.Mocked<TokenHasher> = {
      hash: jest.fn().mockReturnValue('hashed-token'),
    };
    const jobDispatcher: jest.Mocked<JobDispatcher> = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'APP_BASE_URL') {
          return 'http://localhost:4001';
        }

        if (key === 'SELLER_APP_BASE_URL') {
          return 'http://localhost:4002';
        }

        return undefined;
      }),
    };
    const useCase = new RequestPasswordResetUseCase(
      authUserRepository,
      passwordResetTokenRepository,
      tokenHasher,
      jobDispatcher,
      configService as unknown as ConfigService,
    );

    await useCase.execute('seller@example.com', 'seller');

    expect(jobDispatcher.dispatch).toHaveBeenCalledWith(
      'user.send-password-reset-email',
      expect.objectContaining({
        resetUrl: expect.stringMatching(
          /^http:\/\/localhost:4002\/reset\?t=/,
        ),
      }),
    );
  });

  it('returns silently when the email is not registered', async () => {
    const authUserRepository: jest.Mocked<AuthUserRepository> = {
      findByEmail: jest.fn().mockResolvedValue(null),
      findLoginByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updatePassword: jest.fn(),
      assignRole: jest.fn(),
      ensureRole: jest.fn(),
    };
    const passwordResetTokenRepository: jest.Mocked<PasswordResetTokenRepository> = {
      create: jest.fn(),
      findByTokenHash: jest.fn(),
      save: jest.fn(),
      invalidateActiveTokensForUser: jest.fn(),
    };
    const tokenHasher: jest.Mocked<TokenHasher> = {
      hash: jest.fn(),
    };
    const jobDispatcher: jest.Mocked<JobDispatcher> = {
      dispatch: jest.fn(),
    };
    const configService: Pick<jest.Mocked<ConfigService>, 'get'> = {
      get: jest.fn(),
    };
    const useCase = new RequestPasswordResetUseCase(
      authUserRepository,
      passwordResetTokenRepository,
      tokenHasher,
      jobDispatcher,
      configService as unknown as ConfigService,
    );

    await useCase.execute('missing@example.com', 'seller');

    expect(passwordResetTokenRepository.create).not.toHaveBeenCalled();
    expect(jobDispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('returns silently when the user cannot access the reset portal', async () => {
    const authUserRepository: jest.Mocked<AuthUserRepository> = {
      findByEmail: jest.fn().mockResolvedValue({
        id: 'admin-1',
        version: 1,
        email: Email.create('admin@example.com'),
        displayName: 'Admin User',
        status: UserStatus.ACTIVE,
        roles: [RoleKey.create('admin')],
        permissions: [],
      }),
      findLoginByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updatePassword: jest.fn(),
      assignRole: jest.fn(),
      ensureRole: jest.fn(),
    };
    const passwordResetTokenRepository: jest.Mocked<PasswordResetTokenRepository> = {
      create: jest.fn(),
      findByTokenHash: jest.fn(),
      save: jest.fn(),
      invalidateActiveTokensForUser: jest.fn(),
    };
    const tokenHasher: jest.Mocked<TokenHasher> = {
      hash: jest.fn(),
    };
    const jobDispatcher: jest.Mocked<JobDispatcher> = {
      dispatch: jest.fn(),
    };
    const configService: Pick<jest.Mocked<ConfigService>, 'get'> = {
      get: jest.fn(),
    };
    const useCase = new RequestPasswordResetUseCase(
      authUserRepository,
      passwordResetTokenRepository,
      tokenHasher,
      jobDispatcher,
      configService as unknown as ConfigService,
    );

    await useCase.execute('admin@example.com', 'seller');

    expect(passwordResetTokenRepository.invalidateActiveTokensForUser).not.toHaveBeenCalled();
    expect(passwordResetTokenRepository.create).not.toHaveBeenCalled();
    expect(jobDispatcher.dispatch).not.toHaveBeenCalled();
  });
});
