import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import type {
  NotificationListResult,
  NotificationSummary,
} from '../../../app/notification.types';

export class NotificationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  user!: string;

  @ApiProperty()
  type!: string;

  @ApiProperty()
  channel!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty({ type: Object, nullable: true })
  data!: Record<string, unknown> | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  read_at!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at!: Date;
}

export class NotificationListResponseDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  @Type(() => NotificationResponseDto)
  results!: NotificationResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total_pages!: number;

  @ApiProperty()
  total_results!: number;
}

export class NotificationEnvelopeResponseDto {
  @ApiProperty({ type: NotificationResponseDto })
  @Type(() => NotificationResponseDto)
  notification!: NotificationResponseDto;
}

export class NotificationUnreadCountResponseDto {
  @ApiProperty()
  unread_count!: number;
}

export class MarkAllNotificationsReadResponseDto {
  @ApiProperty()
  updated_count!: number;
}

export class WebPushPublicKeyResponseDto {
  @ApiProperty()
  enabled!: boolean;

  @ApiProperty({ type: String, nullable: true })
  public_key!: string | null;
}

export class WebPushSubscriptionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  endpoint!: string;

  @ApiProperty()
  is_active!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at!: Date;
}

export class WebPushSubscriptionEnvelopeResponseDto {
  @ApiProperty({ type: WebPushSubscriptionResponseDto })
  @Type(() => WebPushSubscriptionResponseDto)
  subscription!: WebPushSubscriptionResponseDto;
}

export class WebPushSubscriptionRemovalResponseDto {
  @ApiProperty()
  removed!: boolean;
}

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
