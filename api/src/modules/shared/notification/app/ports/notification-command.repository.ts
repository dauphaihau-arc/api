import type {
  CreateNotificationInput,
  NotificationSummary
} from '../notification.types';

export abstract class NotificationCommandRepository {
  abstract create(input: CreateNotificationInput): Promise<NotificationSummary>;

  abstract markOwnedByIdAsRead(
    userId: string,
    notificationId: string
  ): Promise<NotificationSummary | null>;

  abstract markAllOwnedByUserIdAsRead(userId: string): Promise<number>;
}
