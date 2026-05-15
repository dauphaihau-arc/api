import { Expose, Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf
} from 'class-validator';
import { CouponAppliesTo } from '~/modules/domains/coupon/domain/enums/coupon-applies-to.enum';
import { CouponMinOrderType } from '~/modules/domains/coupon/domain/enums/coupon-min-order-type.enum';
import { CouponType } from '~/modules/domains/coupon/domain/enums/coupon-type.enum';

export class CreateShopCouponDto {
  @IsString()
  code!: string;

  @IsEnum(CouponType)
  type!: CouponType;

  @IsEnum(CouponAppliesTo)
  @Expose({ name: 'applies_to' })
  @Transform(({ value, obj: source }) => value ?? source.applies_to)
  appliesTo = CouponAppliesTo.ALL;

  @IsOptional()
  @Expose({ name: 'applies_product_ids' })
  @Transform(({ value, obj: source }) => value ?? source.applies_product_ids)
  @IsArray()
  @IsUUID('4', { each: true })
  appliesProductIds?: string[];

  @ValidateIf((dto) => dto.type === CouponType.FIXED_AMOUNT)
  @Type(() => Number)
  @Expose({ name: 'amount_off' })
  @Transform(({ value, obj: source }) => value ?? source.amount_off)
  @IsNumber()
  @Min(0.01)
  amountOff?: number;

  @ValidateIf((dto) => dto.type === CouponType.PERCENTAGE)
  @Type(() => Number)
  @Expose({ name: 'percent_off' })
  @Transform(({ value, obj: source }) => value ?? source.percent_off)
  @IsInt()
  @Min(1)
  @Max(99)
  percentOff?: number;

  @IsDateString()
  @Expose({ name: 'start_date' })
  @Transform(({ value, obj: source }) => value ?? source.start_date)
  startDate!: string;

  @IsDateString()
  @Expose({ name: 'end_date' })
  @Transform(({ value, obj: source }) => value ?? source.end_date)
  endDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Expose({ name: 'max_uses' })
  @Transform(({ value, obj: source }) => value ?? source.max_uses)
  maxUses!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Expose({ name: 'max_uses_per_user' })
  @Transform(({ value, obj: source }) => value ?? source.max_uses_per_user)
  maxUsesPerUser!: number;

  @IsEnum(CouponMinOrderType)
  @Expose({ name: 'min_order_type' })
  @Transform(({ value, obj: source }) => value ?? source.min_order_type)
  minOrderType = CouponMinOrderType.NONE;

  @ValidateIf((dto) => dto.minOrderType === CouponMinOrderType.ORDER_TOTAL)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Expose({ name: 'min_order_value' })
  @Transform(({ value, obj: source }) => value ?? source.min_order_value)
  minOrderValue?: number;

  @ValidateIf((dto) => dto.minOrderType === CouponMinOrderType.NUMBER_OF_PRODUCTS)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Expose({ name: 'min_products' })
  @Transform(({ value, obj: source }) => value ?? source.min_products)
  minProducts?: number;

  @IsOptional()
  @Expose({ name: 'is_active' })
  @Transform(({ value, obj: source }) => value ?? source.is_active)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Expose({ name: 'is_auto_sale' })
  @Transform(({ value, obj: source }) => value ?? source.is_auto_sale)
  @IsBoolean()
  isAutoSale?: boolean;
}
