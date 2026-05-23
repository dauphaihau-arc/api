import { Expose, Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength
} from 'class-validator';
import { OrderStatus } from '../../../domain/enums/order-status.enum';

export class UpdateAdminOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @IsOptional()
  @Expose({ name: 'cancel_reason' })
  @Transform(({ value, obj: source }) => value ?? source.cancel_reason)
  @IsString()
  @MaxLength(1000)
  cancelReason?: string;
}
