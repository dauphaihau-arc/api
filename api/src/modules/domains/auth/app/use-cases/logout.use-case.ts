import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../auth.types';
import { AuthSessionRepository } from '../ports/auth-session.repository';

@Injectable()
export class LogoutUseCase {
  constructor(private readonly authSessionRepository: AuthSessionRepository) {}

  async execute(currentUser: AuthenticatedUser): Promise<void> {
    const session = await this.authSessionRepository.findById(
      currentUser.sessionId
    );

    if (
      !session
      || session.userId !== currentUser.userId
      || session.revokedAt
    ) {
      return;
    }

    session.revokedAt = new Date();
    await this.authSessionRepository.save(session);
  }
}
