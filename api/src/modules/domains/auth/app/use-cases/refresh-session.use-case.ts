import { Injectable } from '@nestjs/common';
import { err, Result } from '../../../../../common/application/result';
import { AuthResponse } from '../auth.types';
import {
  InactiveUserError,
  InvalidRefreshTokenError,
  RefreshSessionInactiveError,
  RefreshSessionNotFoundError,
  RefreshTokenMismatchError,
  UserNotFoundError
} from '../errors/auth-app.error';
import { UserStatus } from '../../domain/enums/user-status.enum';
import { AuthSessionRepository } from '../ports/auth-session.repository';
import { AuthTokenService } from '../ports/auth-token.service';
import { TokenHasher } from '../ports/token-hasher';
import { AuthUserRepository } from '../ports/auth-user.repository';
import { IssueSessionUseCase } from './shared/issue-session.use-case';

@Injectable()
export class RefreshSessionUseCase {
  constructor(
    private readonly authSessionRepository: AuthSessionRepository,
    private readonly authTokenService: AuthTokenService,
    private readonly tokenHasher: TokenHasher,
    private readonly authUserRepository: AuthUserRepository,
    private readonly issueSessionUseCase: IssueSessionUseCase
  ) {}

  async execute(refreshToken: string): Promise<
    Result<
      AuthResponse,
      | InactiveUserError
      | InvalidRefreshTokenError
      | RefreshSessionInactiveError
      | RefreshSessionNotFoundError
      | RefreshTokenMismatchError
      | UserNotFoundError
    >
  > {
    const payload =
      await this.authTokenService.verifyRefreshToken(refreshToken);

    if (!payload || payload.type !== 'refresh') {
      return err(new InvalidRefreshTokenError());
    }

    const session = await this.authSessionRepository.findById(
      payload.sessionId
    );

    if (!session || session.userId !== payload.sub) {
      return err(new RefreshSessionNotFoundError());
    }

    if (session.revokedAt || session.expiresAt <= new Date()) {
      return err(new RefreshSessionInactiveError());
    }

    if (session.refreshTokenHash !== this.tokenHasher.hash(refreshToken)) {
      return err(new RefreshTokenMismatchError());
    }

    const user = await this.authUserRepository.findById(session.userId);

    if (!user) {
      return err(new UserNotFoundError());
    }

    if (user.status !== UserStatus.ACTIVE) {
      return err(new InactiveUserError());
    }

    return this.issueSessionUseCase.execute(user.id, session);
  }
}
