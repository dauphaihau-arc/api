import { Expose, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MaxLength
} from 'class-validator';

export class RequestOrderCancelDto {
  @IsOptional()
  @ApiPropertyOptional({ name: 'cancel_reason', maxLength: 1000 })
  @Expose({ name: 'cancel_reason' })
  @Transform(({ value, obj: source }) => value ?? source.cancel_reason)
  @IsString()
  @MaxLength(1000)
  cancelReason?: string;
}
