import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { NotificationRepository } from '../../ports/notification.repository';

@Injectable()
export class GetMyNotificationUnreadCountUseCase {
  constructor(
    private readonly notificationRepository: NotificationRepository,
  ) {}

  async execute(actor: AuthenticatedUser): Promise<number> {
    return this.notificationRepository.countUnreadOwnedByUserId(actor.userId);
  }
}
