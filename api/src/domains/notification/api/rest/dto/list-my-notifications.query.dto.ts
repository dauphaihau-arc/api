import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import {
  NOTIFICATION_LIST_DEFAULT_LIMIT,
  NOTIFICATION_LIST_DEFAULT_PAGE,
  NOTIFICATION_LIST_MAX_LIMIT,
} from '../queries/notification.constants';

export class ListMyNotificationsQueryDto {
  @ApiPropertyOptional({
    description: 'One-based page number.',
    type: Number,
    minimum: 1,
    default: NOTIFICATION_LIST_DEFAULT_PAGE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = NOTIFICATION_LIST_DEFAULT_PAGE;

  @ApiPropertyOptional({
    description: 'Maximum number of notifications to return.',
    type: Number,
    minimum: 1,
    maximum: NOTIFICATION_LIST_MAX_LIMIT,
    default: NOTIFICATION_LIST_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(NOTIFICATION_LIST_MAX_LIMIT)
  limit = NOTIFICATION_LIST_DEFAULT_LIMIT;
}
