import type { NotificationSummary } from '../app/notification.types';
import { NotificationEntity } from './persistence/entities/notification.entity';

export function toNotificationSummary(notification: NotificationEntity): NotificationSummary {
  return {
    id: notification.id,
    userId: notification.user.id,
    type: notification.type,
    channel: notification.channel,
    title: notification.title,
    body: notification.body,
    data: notification.data,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
  };
}
