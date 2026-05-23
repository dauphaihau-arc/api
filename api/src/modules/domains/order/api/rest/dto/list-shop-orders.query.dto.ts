import { Expose, Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  Max,
  Min
} from 'class-validator';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';

const SHOP_ORDER_LIST_DEFAULT_PAGE = 1;
const SHOP_ORDER_LIST_DEFAULT_LIMIT = 20;
const SHOP_ORDER_LIST_MAX_LIMIT = 100;

export class ListShopOrdersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page: number = SHOP_ORDER_LIST_DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(SHOP_ORDER_LIST_MAX_LIMIT)
  limit: number = SHOP_ORDER_LIST_DEFAULT_LIMIT;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @Expose({ name: 'shipping_status' })
  @Transform(({ value, obj: source }) => value ?? source.shipping_status)
  @IsEnum(OrderShippingStatus)
  shippingStatus?: OrderShippingStatus;
}
