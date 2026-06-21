import { Expose, Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PaymentType } from '../../../domain/enums/payment-type.enum';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';

const SHOP_ORDER_LIST_DEFAULT_PAGE = 1;
const SHOP_ORDER_LIST_DEFAULT_LIMIT = 20;
const SHOP_ORDER_LIST_MAX_LIMIT = 100;

function toOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const rawValues = Array.isArray(value) ? value : [value];
  const normalized = rawValues
    .flatMap((entry) => String(entry).split(','))
    .map(entry => entry.trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : undefined;
}

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
  @Transform(({ value, obj: source }) => toOptionalStringArray(value ?? source.status))
  @IsArray()
  @IsEnum(OrderStatus, { each: true })
  status?: OrderStatus[];

  @IsOptional()
  @Expose({ name: 'shipping_status' })
  @Transform(({ value, obj: source }) => toOptionalStringArray(value ?? source.shipping_status))
  @IsArray()
  @IsEnum(OrderShippingStatus, { each: true })
  shippingStatus?: OrderShippingStatus[];

  @IsOptional()
  @Expose({ name: 'created_from' })
  @Transform(({ value, obj: source }) => value ?? source.created_from)
  @Type(() => Date)
  @IsDate()
  createdFrom?: Date;

  @IsOptional()
  @Expose({ name: 'created_to' })
  @Transform(({ value, obj: source }) => value ?? source.created_to)
  @Type(() => Date)
  @IsDate()
  createdTo?: Date;

  @IsOptional()
  @Expose({ name: 'amount_min' })
  @Transform(({ value, obj: source }) => value ?? source.amount_min)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountMin?: number;

  @IsOptional()
  @Expose({ name: 'amount_max' })
  @Transform(({ value, obj: source }) => value ?? source.amount_max)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountMax?: number;

  @IsOptional()
  @Transform(({ value, obj: source }) => toOptionalStringArray(value ?? source.currency))
  @IsArray()
  @IsString({ each: true })
  currency?: string[];

  @IsOptional()
  @Expose({ name: 'payment_type' })
  @Transform(({ value, obj: source }) => toOptionalStringArray(value ?? source.payment_type))
  @IsArray()
  @IsEnum(PaymentType, { each: true })
  paymentType?: PaymentType[];

  @IsOptional()
  @IsString()
  search?: string;
}
