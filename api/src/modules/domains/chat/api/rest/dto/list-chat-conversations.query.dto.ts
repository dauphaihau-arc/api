import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Max, Min } from 'class-validator';
import {
  CHAT_LIST_DEFAULT_LIMIT,
  CHAT_LIST_DEFAULT_PAGE,
  CHAT_LIST_MAX_LIMIT
} from '../../../app/chat.types';

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
}
