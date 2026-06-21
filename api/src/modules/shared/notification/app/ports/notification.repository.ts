import type {
  CreateNotificationInput,
  NotificationListRepositoryResult,
  NotificationSummary,
} from '../notification.types';

export abstract class NotificationRepository {
  abstract create(input: CreateNotificationInput): Promise<NotificationSummary>;

  abstract findAllOwnedByUserId(
    userId: string,
    page: number,
    limit: number
  ): Promise<NotificationListRepositoryResult>;

  abstract countUnreadOwnedByUserId(userId: string): Promise<number>;

  abstract markOwnedByIdAsRead(
    userId: string,
    notificationId: string
  ): Promise<NotificationSummary | null>;

  abstract markAllOwnedByUserIdAsRead(userId: string): Promise<number>;
}
