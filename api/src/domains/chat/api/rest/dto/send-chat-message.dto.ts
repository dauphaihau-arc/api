import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject, IsOptional, IsString, MaxLength, 
} from 'class-validator';

export class SendChatMessageDto {
  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @MaxLength(5000)
  body!: string;

  @ApiPropertyOptional({
    name: 'metadata',
    type: 'object',
    additionalProperties: true,
    description: 'Free-form message metadata.',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
