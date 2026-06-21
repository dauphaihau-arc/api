import type { PasswordResetTokenRepository } from '../../ports/password-reset-token.repository';
import type { TokenHasher } from '../../ports/token-hasher';
import {
  InvalidPasswordResetTokenError,
  PasswordResetTokenExpiredError,
} from '../../errors/auth-app.error';
import { VerifyResetPasswordTokenUseCase } from './verify-reset-password-token.use-case';

describe('VerifyResetPasswordTokenUseCase', () => {
  it('returns ok for an active token', async () => {
    const repository: jest.Mocked<PasswordResetTokenRepository> = {
      create: jest.fn(),
      findByTokenHash: jest.fn().mockResolvedValue({
        id: 'token-1',
        userId: 'user-1',
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 10_000),
      }),
      save: jest.fn(),
      invalidateActiveTokensForUser: jest.fn(),
    };
    const tokenHasher: jest.Mocked<TokenHasher> = {
      hash: jest.fn().mockReturnValue('hashed-token'),
    };
    const useCase = new VerifyResetPasswordTokenUseCase(repository, tokenHasher);

    const result = await useCase.execute('raw-token');

    expect(result).toEqual({ isOk: true, value: undefined });
  });

  it('rejects a missing token', async () => {
    const repository: jest.Mocked<PasswordResetTokenRepository> = {
      create: jest.fn(),
      findByTokenHash: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      invalidateActiveTokensForUser: jest.fn(),
    };
    const tokenHasher: jest.Mocked<TokenHasher> = {
      hash: jest.fn().mockReturnValue('hashed-token'),
    };
    const useCase = new VerifyResetPasswordTokenUseCase(repository, tokenHasher);

    const result = await useCase.execute('raw-token');

    expect(result.isOk).toBe(false);
    if (result.isOk) {
      throw new Error('Expected verify token to fail');
    }
    expect(result.error).toBeInstanceOf(InvalidPasswordResetTokenError);
  });

  it('rejects an expired token', async () => {
    const repository: jest.Mocked<PasswordResetTokenRepository> = {
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
    const tokenHasher: jest.Mocked<TokenHasher> = {
      hash: jest.fn().mockReturnValue('hashed-token'),
    };
    const useCase = new VerifyResetPasswordTokenUseCase(repository, tokenHasher);

    const result = await useCase.execute('raw-token');

    expect(result.isOk).toBe(false);
    if (result.isOk) {
      throw new Error('Expected verify token to fail');
    }
    expect(result.error).toBeInstanceOf(PasswordResetTokenExpiredError);
  });
});
