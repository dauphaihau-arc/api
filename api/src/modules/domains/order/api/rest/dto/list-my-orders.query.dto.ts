import { Expose, Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';

const MY_ORDER_LIST_DEFAULT_PAGE = 1;
const MY_ORDER_LIST_DEFAULT_LIMIT = 20;
const MY_ORDER_LIST_MAX_LIMIT = 100;
export const MY_ORDER_LIST_STATES = [
  'awaiting_payment',
  'processing',
  'shipped',
  'delivered',
  'canceled',
  'refunded',
] as const;

export type MyOrderListState = typeof MY_ORDER_LIST_STATES[number];

export class ListMyOrdersQueryDto {
  @IsOptional()
  @ApiPropertyOptional()
  @Type(() => Number)
  @Min(1)
  page: number = MY_ORDER_LIST_DEFAULT_PAGE;

  @IsOptional()
  @ApiPropertyOptional()
  @Type(() => Number)
  @Min(1)
  @Max(MY_ORDER_LIST_MAX_LIMIT)
  limit: number = MY_ORDER_LIST_DEFAULT_LIMIT;

  @IsOptional()
  @ApiPropertyOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @ApiPropertyOptional({ name: 'shipping_status' })
  @Expose({ name: 'shipping_status' })
  @Transform(({ value, obj: source }) => value ?? source.shipping_status)
  @IsEnum(OrderShippingStatus)
  shippingStatus?: OrderShippingStatus;

  @IsOptional()
  @ApiPropertyOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @ApiPropertyOptional({ enum: MY_ORDER_LIST_STATES })
  @IsIn(MY_ORDER_LIST_STATES)
  state?: MyOrderListState;
}
