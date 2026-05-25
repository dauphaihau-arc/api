import type {
  NotificationListResult,
  NotificationSummary
} from '../../app/notification.types';

export function toNotificationResponse(notification: NotificationSummary) {
  return {
    id: notification.id,
    user: notification.userId,
    type: notification.type,
    channel: notification.channel,
    title: notification.title,
    body: notification.body,
    data: notification.data ?? null,
    read_at: notification.readAt ?? null,
    created_at: notification.createdAt,
    updated_at: notification.updatedAt,
  };
}

export function toNotificationListResponse(result: NotificationListResult) {
  return {
    results: result.results.map(toNotificationResponse),
    page: result.page,
    limit: result.limit,
    total_pages: result.totalPages,
    total_results: result.totalResults,
  };
}
