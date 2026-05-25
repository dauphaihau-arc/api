import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  Max,
  Min
} from 'class-validator';
import {
  NOTIFICATION_LIST_DEFAULT_LIMIT,
  NOTIFICATION_LIST_DEFAULT_PAGE,
  NOTIFICATION_LIST_MAX_LIMIT
} from '../../../app/notification.types';

export class ListMyNotificationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = NOTIFICATION_LIST_DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(NOTIFICATION_LIST_MAX_LIMIT)
  limit = NOTIFICATION_LIST_DEFAULT_LIMIT;
}
