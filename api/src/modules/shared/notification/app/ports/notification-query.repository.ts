import type {
  NotificationListRepositoryResult
} from '../notification.types';

export abstract class NotificationQueryRepository {
  abstract findAllOwnedByUserId(
    userId: string,
    page: number,
    limit: number
  ): Promise<NotificationListRepositoryResult>;

  abstract countUnreadOwnedByUserId(userId: string): Promise<number>;
}
