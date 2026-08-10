import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  CHAT_MESSAGE_LIST_DEFAULT_LIMIT,
  CHAT_MESSAGE_LIST_MAX_LIMIT,
} from '../../../app/chat.types';

export class ListChatMessagesQueryDto {
  @IsOptional()
  @ApiPropertyOptional()
  @IsString()
  before?: string;

  @IsOptional()
  @ApiPropertyOptional()
  @Type(() => Number)
  @Min(1)
  @Max(CHAT_MESSAGE_LIST_MAX_LIMIT)
  limit: number = CHAT_MESSAGE_LIST_DEFAULT_LIMIT;
}
