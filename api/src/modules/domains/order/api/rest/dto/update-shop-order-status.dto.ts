import { Expose, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength
} from 'class-validator';
import { OrderStatus } from '../../../domain/enums/order-status.enum';

export class UpdateShopOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @IsOptional()
  @ApiPropertyOptional({ name: 'cancel_reason', maxLength: 1000 })
  @Expose({ name: 'cancel_reason' })
  @Transform(({ value, obj: source }) => value ?? source.cancel_reason)
  @IsString()
  @MaxLength(1000)
  cancelReason?: string;
}
