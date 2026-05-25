export const NOTIFICATION_LIST_DEFAULT_PAGE = 1;
export const NOTIFICATION_LIST_DEFAULT_LIMIT = 20;
export const NOTIFICATION_LIST_MAX_LIMIT = 50;

export type NotificationChannel = 'in_app' | 'web_push';

export interface NotificationSummary {
  id: string;
  userId: string;
  type: string;
  channel: NotificationChannel;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  channel?: NotificationChannel;
  data?: Record<string, unknown>;
}

export interface NotifyUserInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channels?: NotificationChannel[];
}

export interface ListMyNotificationsQuery {
  page: number;
  limit: number;
}

export interface NotificationListRepositoryResult {
  items: NotificationSummary[];
  total: number;
}

export interface NotificationListResult {
  results: NotificationSummary[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}

export interface WebPushSubscriptionSummary {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
  isActive: boolean;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterWebPushSubscriptionInput {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

export function buildListMyNotificationsQuery(input?: Partial<ListMyNotificationsQuery>): ListMyNotificationsQuery {
  return {
    page: input?.page ?? NOTIFICATION_LIST_DEFAULT_PAGE,
    limit: input?.limit ?? NOTIFICATION_LIST_DEFAULT_LIMIT,
  };
}
