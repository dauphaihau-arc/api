import type {
  NotificationListResult,
  NotificationSummary,
} from '../../app/notification.types';

function toSnakeCaseKey(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toSnakeCaseValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toSnakeCaseValue);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      toSnakeCaseKey(key),
      toSnakeCaseValue(nestedValue),
    ]),
  );
}

export function toNotificationResponse(notification: NotificationSummary) {
  return {
    id: notification.id,
    user: notification.userId,
    type: notification.type,
    channel: notification.channel,
    title: notification.title,
    body: notification.body,
    data: toSnakeCaseValue(notification.data ?? null),
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
