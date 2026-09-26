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
import { FulfillmentAggregateStatus } from '../../../../fulfillment/domain/enums/fulfillment-aggregate-status.enum';
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
  @ApiPropertyOptional({ name: 'fulfillment_status' })
  @Expose({ name: 'fulfillment_status' })
  @Transform(({ value, obj: source }) => value ?? source.fulfillment_status)
  @IsEnum(FulfillmentAggregateStatus)
  fulfillmentStatus?: FulfillmentAggregateStatus;

  @IsOptional()
  @ApiPropertyOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @ApiPropertyOptional({ enum: MY_ORDER_LIST_STATES })
  @IsIn(MY_ORDER_LIST_STATES)
  state?: MyOrderListState;
}
