import { Injectable } from '@nestjs/common';
import { err, ok, Result } from '~/common/application/result';
import {
  InvalidPasswordResetTokenError,
  PasswordResetTokenExpiredError
} from '../../errors/auth-app.error';
import { PasswordResetTokenRepository } from '../../ports/password-reset-token.repository';
import { TokenHasher } from '../../ports/token-hasher';

@Injectable()
export class VerifyResetPasswordTokenUseCase {
  constructor(
    private readonly passwordResetTokenRepository: PasswordResetTokenRepository,
    private readonly tokenHasher: TokenHasher
  ) {}

  async execute(
    token: string
  ): Promise<
    Result<
      void,
      InvalidPasswordResetTokenError | PasswordResetTokenExpiredError
    >
  > {
    const passwordResetToken = await this.passwordResetTokenRepository.findByTokenHash(
      this.tokenHasher.hash(token)
    );

    if (!passwordResetToken || passwordResetToken.usedAt) {
      return err(new InvalidPasswordResetTokenError());
    }

    if (passwordResetToken.expiresAt.getTime() <= Date.now()) {
      return err(new PasswordResetTokenExpiredError());
    }

    return ok(undefined);
  }
}
