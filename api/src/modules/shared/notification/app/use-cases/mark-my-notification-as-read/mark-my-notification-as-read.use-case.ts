import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { NotificationRepository } from '../../ports/notification.repository';
import type { NotificationSummary } from '../../notification.types';

@Injectable()
export class MarkMyNotificationAsReadUseCase {
  constructor(
    private readonly notificationRepository: NotificationRepository
  ) {}

  async execute(
    actor: AuthenticatedUser,
    notificationId: string
  ): Promise<NotificationSummary> {
    const notification = await this.notificationRepository.markOwnedByIdAsRead(
      actor.userId,
      notificationId
    );

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return notification;
  }
}
