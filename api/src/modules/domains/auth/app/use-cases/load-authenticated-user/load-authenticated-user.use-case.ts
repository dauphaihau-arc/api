import { Injectable } from '@nestjs/common';
import { err, Result, ok } from '../../../../../../common/application/result';
import { AuthenticatedUser } from '../../auth.types';
import {
  InactiveUserError,
  SessionNotActiveError,
  UserNotFoundError
} from '../../errors/auth-app.error';
import { UserStatus } from '../../../domain/enums/user-status.enum';
import { AuthSessionRepository } from '../../ports/auth-session.repository';
import { AuthUserRepository } from '../../ports/auth-user.repository';

@Injectable()
export class LoadAuthenticatedUserUseCase {
  constructor(
    private readonly authSessionRepository: AuthSessionRepository,
    private readonly authUserRepository: AuthUserRepository
  ) {}

  async execute(
    userId: string,
    sessionId: string
  ): Promise<
    Result<
      AuthenticatedUser,
      InactiveUserError | SessionNotActiveError | UserNotFoundError
    >
  > {
    const session = await this.authSessionRepository.findById(sessionId);

    if (
      !session
      || session.userId !== userId
      || session.revokedAt
      || session.expiresAt <= new Date()
    ) {
      return err(new SessionNotActiveError());
    }

    const user = await this.authUserRepository.findById(userId);

    if (!user) {
      return err(new UserNotFoundError());
    }

    if (user.status !== UserStatus.ACTIVE) {
      return err(new InactiveUserError());
    }

    return ok({
      userId: user.id,
      email: user.email.toString(),
      displayName: user.displayName,
      status: user.status,
      sessionId: session.id,
      roles: user.roles.map((role) => role.toString()),
      permissions: user.permissions.map((permission) => permission.toString()),
    });
  }
}
