import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';
import {
  CHAT_LIST_DEFAULT_LIMIT,
  CHAT_LIST_DEFAULT_PAGE,
  CHAT_LIST_MAX_LIMIT,
} from '../queries/chat.constants';

export class ListChatConversationsQueryDto {
  @IsOptional()
  @ApiPropertyOptional()
  @Type(() => Number)
  @Min(1)
  page: number = CHAT_LIST_DEFAULT_PAGE;

  @IsOptional()
  @ApiPropertyOptional()
  @Type(() => Number)
  @Min(1)
  @Max(CHAT_LIST_MAX_LIMIT)
  limit: number = CHAT_LIST_DEFAULT_LIMIT;

  @ApiPropertyOptional({
    description: 'When true, only conversations with unread messages for the current participant are returned.',
  })
  @Transform(({ value }) => {
    if (value == null || value === '') {
      return undefined;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    return value === 'true' || value === '1';
  })
  @IsOptional()
  @IsBoolean()
  unread?: boolean;

  @ApiPropertyOptional({
    description: 'Case-insensitive search term matched against the participant name and the last message preview.',
    maxLength: 100,
  })
  @Transform(({ value }) => {
    if (value == null) {
      return undefined;
    }

    if (typeof value !== 'string') {
      return value;
    }

    const term = value.trim();

    return term === '' ? undefined : term;
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
