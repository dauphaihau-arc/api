import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { NotificationRepository } from '../../ports/notification.repository';

@Injectable()
export class MarkAllMyNotificationsAsReadUseCase {
  constructor(
    private readonly notificationRepository: NotificationRepository,
  ) {}

  async execute(actor: AuthenticatedUser): Promise<{ updatedCount: number }> {
    const updatedCount = await this.notificationRepository.markAllOwnedByUserIdAsRead(
      actor.userId,
    );

    return { updatedCount };
  }
}
