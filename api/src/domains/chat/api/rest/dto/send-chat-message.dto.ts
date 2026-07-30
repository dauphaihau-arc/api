import { ApiProperty } from '@nestjs/swagger';
import {
  IsObject, IsOptional, IsString, MaxLength, 
} from 'class-validator';

export class SendChatMessageDto {
  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @MaxLength(5000)
  body!: string;

  @ApiProperty({ name: 'metadata', required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
