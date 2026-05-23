import { Expose, Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength
} from 'class-validator';

export class RequestOrderCancelDto {
  @IsOptional()
  @Expose({ name: 'cancel_reason' })
  @Transform(({ value, obj: source }) => value ?? source.cancel_reason)
  @IsString()
  @MaxLength(1000)
  cancelReason?: string;
}
