import { Expose, Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  ValidateIf,
} from 'class-validator';
import { CouponAppliesTo } from '~/modules/domains/coupon/domain/enums/coupon-applies-to.enum';
import { CouponMinOrderType } from '~/modules/domains/coupon/domain/enums/coupon-min-order-type.enum';
import { CouponType } from '~/modules/domains/coupon/domain/enums/coupon-type.enum';

export class CreateShopCouponDto {
  @IsString()
  @ApiProperty()
  code!: string;

  @IsEnum(CouponType)
  @ApiProperty({ enum: CouponType })
  type!: CouponType;

  @ApiProperty({ name: 'applies_to', enum: CouponAppliesTo, default: CouponAppliesTo.ALL })
  @IsEnum(CouponAppliesTo)
  @Expose({ name: 'applies_to' })
  @Transform(({ value, obj: source }) => value ?? source.applies_to)
  appliesTo = CouponAppliesTo.ALL;

  @IsOptional()
  @ApiPropertyOptional({ name: 'applies_product_ids', type: [String] })
  @Expose({ name: 'applies_product_ids' })
  @Transform(({ value, obj: source }) => value ?? source.applies_product_ids)
  @IsArray()
  @IsUUID('4', { each: true })
  appliesProductIds?: string[];

  @ValidateIf((dto) => dto.type === CouponType.FIXED_AMOUNT)
  @Type(() => Number)
  @ApiPropertyOptional({ name: 'amount_off', minimum: 0.01 })
  @Expose({ name: 'amount_off' })
  @Transform(({ value, obj: source }) => value ?? source.amount_off)
  @IsNumber()
  @Min(0.01)
  amountOff?: number;

  @ValidateIf((dto) => dto.type === CouponType.PERCENTAGE)
  @Type(() => Number)
  @ApiPropertyOptional({ name: 'percent_off', minimum: 1, maximum: 99 })
  @Expose({ name: 'percent_off' })
  @Transform(({ value, obj: source }) => value ?? source.percent_off)
  @IsInt()
  @Min(1)
  @Max(99)
  percentOff?: number;

  @IsDateString()
  @ApiProperty({ name: 'start_date' })
  @Expose({ name: 'start_date' })
  @Transform(({ value, obj: source }) => value ?? source.start_date)
  startDate!: string;

  @IsDateString()
  @ApiProperty({ name: 'end_date' })
  @Expose({ name: 'end_date' })
  @Transform(({ value, obj: source }) => value ?? source.end_date)
  endDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({ name: 'max_uses', minimum: 1 })
  @Expose({ name: 'max_uses' })
  @Transform(({ value, obj: source }) => value ?? source.max_uses)
  maxUses!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({ name: 'max_uses_per_user', minimum: 1 })
  @Expose({ name: 'max_uses_per_user' })
  @Transform(({ value, obj: source }) => value ?? source.max_uses_per_user)
  maxUsesPerUser!: number;

  @IsEnum(CouponMinOrderType)
  @ApiProperty({
    name: 'min_order_type',
    enum: CouponMinOrderType,
    default: CouponMinOrderType.NONE,
  })
  @Expose({ name: 'min_order_type' })
  @Transform(({ value, obj: source }) => value ?? source.min_order_type)
  minOrderType = CouponMinOrderType.NONE;

  @ValidateIf((dto) => dto.minOrderType === CouponMinOrderType.ORDER_TOTAL)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @ApiPropertyOptional({ name: 'min_order_value', minimum: 0 })
  @Expose({ name: 'min_order_value' })
  @Transform(({ value, obj: source }) => value ?? source.min_order_value)
  minOrderValue?: number;

  @ValidateIf((dto) => dto.minOrderType === CouponMinOrderType.NUMBER_OF_PRODUCTS)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ name: 'min_products', minimum: 1 })
  @Expose({ name: 'min_products' })
  @Transform(({ value, obj: source }) => value ?? source.min_products)
  minProducts?: number;

  @IsOptional()
  @ApiPropertyOptional({ name: 'is_active' })
  @Expose({ name: 'is_active' })
  @Transform(({ value, obj: source }) => value ?? source.is_active)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @ApiPropertyOptional({ name: 'is_auto_sale' })
  @Expose({ name: 'is_auto_sale' })
  @Transform(({ value, obj: source }) => value ?? source.is_auto_sale)
  @IsBoolean()
  isAutoSale?: boolean;
}
