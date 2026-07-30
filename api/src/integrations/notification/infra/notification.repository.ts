import { Injectable } from '@nestjs/common';
import { NotificationCommandRepository } from '../app/ports/notification-command.repository';
import { NotificationQueryRepository } from '../app/ports/notification-query.repository';
import { NotificationRepository } from '../app/ports/notification.repository';
import type {
  CreateNotificationInput,
  NotificationListRepositoryResult,
  NotificationSummary,
} from '../app/notification.types';

@Injectable()
export class DelegatingNotificationRepository implements NotificationRepository {
  constructor(
    private readonly commandRepository: NotificationCommandRepository,
    private readonly queryRepository: NotificationQueryRepository,
  ) {}

  create(input: CreateNotificationInput): Promise<NotificationSummary> {
    return this.commandRepository.create(input);
  }

  findAllOwnedByUserId(
    userId: string,
    page: number,
    limit: number,
  ): Promise<NotificationListRepositoryResult> {
    return this.queryRepository.findAllOwnedByUserId(userId, page, limit);
  }

  countUnreadOwnedByUserId(userId: string): Promise<number> {
    return this.queryRepository.countUnreadOwnedByUserId(userId);
  }

  markOwnedByIdAsRead(
    userId: string,
    notificationId: string,
  ): Promise<NotificationSummary | null> {
    return this.commandRepository.markOwnedByIdAsRead(userId, notificationId);
  }

  markAllOwnedByUserIdAsRead(userId: string): Promise<number> {
    return this.commandRepository.markAllOwnedByUserIdAsRead(userId);
  }
}
