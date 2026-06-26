import { Injectable } from '@nestjs/common';
import { err, Result } from '~/common/application/result';
import type { AuthResponse } from '../../auth.types';
import {
  InvalidPasswordResetTokenError,
  PasswordResetTokenExpiredError,
  UserNotFoundError,
} from '../../errors/auth-app.error';
import { PasswordHash } from '../../../domain/value-objects/password-hash';
import { AuthSessionRepository } from '../../ports/auth-session.repository';
import { AuthUserRepository } from '../../ports/auth-user.repository';
import { PasswordHasher } from '../../ports/password-hasher';
import { PasswordResetTokenRepository } from '../../ports/password-reset-token.repository';
import { TokenHasher } from '../../ports/token-hasher';
import { IssueSessionUseCase } from '../issue-session/issue-session.use-case';

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    private readonly authUserRepository: AuthUserRepository,
    private readonly authSessionRepository: AuthSessionRepository,
    private readonly passwordResetTokenRepository: PasswordResetTokenRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenHasher: TokenHasher,
    private readonly issueSessionUseCase: IssueSessionUseCase,
  ) {}

  async execute(input: {
    token: string;
    password: string;
  }): Promise<
    Result<
      AuthResponse,
      | InvalidPasswordResetTokenError
      | PasswordResetTokenExpiredError
      | UserNotFoundError
    >
  > {
    const passwordResetToken = await this.passwordResetTokenRepository.findByTokenHash(
      this.tokenHasher.hash(input.token),
    );

    if (!passwordResetToken || passwordResetToken.usedAt) {
      return err(new InvalidPasswordResetTokenError());
    }

    if (passwordResetToken.expiresAt.getTime() <= Date.now()) {
      return err(new PasswordResetTokenExpiredError());
    }

    const user = await this.authUserRepository.findById(passwordResetToken.userId);

    if (!user) {
      return err(new UserNotFoundError());
    }

    const passwordUpdatedAt = new Date();

    await this.authUserRepository.updatePassword({
      userId: user.id,
      passwordHash: PasswordHash.fromPersisted(
        await this.passwordHasher.hash(input.password),
      ),
      passwordUpdatedAt,
    });
    await this.authSessionRepository.revokeAllForUser(user.id);

    passwordResetToken.usedAt = passwordUpdatedAt;
    await this.passwordResetTokenRepository.save(passwordResetToken);

    return this.issueSessionUseCase.execute(user.id, undefined, user);
  }
}
