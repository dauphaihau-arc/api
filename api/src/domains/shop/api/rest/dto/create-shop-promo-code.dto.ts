import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PromotionBenefitType } from '~/domains/promotion/domain/enums/promotion-benefit-type.enum';
import { PromotionMinOrderType } from '~/domains/promotion/domain/enums/promotion-min-order-type.enum';
import { PromotionProductScope } from '~/domains/promotion/domain/enums/promotion-product-scope.enum';
import { PromotionVisibility } from '~/domains/promotion/domain/enums/promotion-visibility.enum';

const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * The seller-facing Promo Code form's payload: an ordinary internal name, a
 * normalized redemption code, a percentage, fixed-amount or free-shipping
 * benefit, an optional qualifying condition (minimum spend or minimum eligible
 * quantity), public or code-only visibility, an all-or-selected Product Scope,
 * and an explicit schedule authored as local wall-clock times in a chosen IANA
 * timezone. Free shipping is always shop-wide, so it carries no percentage or
 * fixed amount and never selects Products; the use case rejects that
 * combination even though the DTO cannot express it on a single field.
 *
 * The benefit and condition fields are shape-validated here: the value that a
 * selected `benefit_type` or `min_order_type` requires must be present and
 * positive, while the fields for the other shapes are rejected by the use case
 * so no zero-value or contradictory combination can be persisted.
 *
 * `start_now` starts the code immediately; otherwise `start_local` carries the
 * chosen wall clock. The optional offsets let a caller explicitly disambiguate
 * a repeated fall-back local time; a nonexistent spring-forward local time is
 * always rejected.
 */
export class CreateShopPromoCodeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @ApiProperty()
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  @ApiProperty()
  code!: string;

  @IsIn([
    PromotionBenefitType.PERCENTAGE,
    PromotionBenefitType.FIXED_AMOUNT,
    PromotionBenefitType.FREE_SHIPPING,
  ])
  @IsOptional()
  @ApiProperty({
    name: 'benefit_type',
    enum: [
      PromotionBenefitType.PERCENTAGE,
      PromotionBenefitType.FIXED_AMOUNT,
      PromotionBenefitType.FREE_SHIPPING,
    ],
    default: PromotionBenefitType.PERCENTAGE,
  })
  benefit_type: PromotionBenefitType = PromotionBenefitType.PERCENTAGE;

  @ValidateIf((dto: CreateShopPromoCodeDto) =>
    dto.benefit_type === PromotionBenefitType.PERCENTAGE)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  @ApiPropertyOptional({ name: 'percent_off', minimum: 1, maximum: 99 })
  percent_off?: number;

  @ValidateIf((dto: CreateShopPromoCodeDto) =>
    dto.benefit_type === PromotionBenefitType.FIXED_AMOUNT)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @ApiPropertyOptional({ name: 'amount_off', minimum: 0.01 })
  amount_off?: number;

  @IsEnum(PromotionMinOrderType)
  @IsOptional()
  @ApiProperty({
    name: 'min_order_type',
    enum: PromotionMinOrderType,
    default: PromotionMinOrderType.NONE,
  })
  min_order_type: PromotionMinOrderType = PromotionMinOrderType.NONE;

  @ValidateIf((dto: CreateShopPromoCodeDto) =>
    dto.min_order_type === PromotionMinOrderType.ORDER_TOTAL)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @ApiPropertyOptional({ name: 'min_order_value', minimum: 0.01 })
  min_order_value?: number;

  @ValidateIf((dto: CreateShopPromoCodeDto) =>
    dto.min_order_type === PromotionMinOrderType.PURCHASE_QUANTITY)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ name: 'min_purchase_quantity', minimum: 1 })
  min_purchase_quantity?: number;

  @IsEnum(PromotionVisibility)
  @IsOptional()
  @ApiProperty({ name: 'visibility', enum: PromotionVisibility, default: PromotionVisibility.CODE_ONLY })
  visibility: PromotionVisibility = PromotionVisibility.CODE_ONLY;

  @IsEnum(PromotionProductScope)
  @IsOptional()
  @ApiProperty({ name: 'product_scope', enum: PromotionProductScope, default: PromotionProductScope.ALL })
  product_scope: PromotionProductScope = PromotionProductScope.ALL;

  @ValidateIf((dto: CreateShopPromoCodeDto) =>
    dto.product_scope === PromotionProductScope.SPECIFIC)
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  @ApiPropertyOptional({ name: 'product_ids', type: [String] })
  product_ids?: string[];

  @IsString()
  @MaxLength(64)
  @ApiProperty({ description: 'IANA timezone the schedule is authored in.' })
  timezone!: string;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ name: 'start_now', default: false })
  start_now?: boolean;

  @ValidateIf((dto: CreateShopPromoCodeDto) => dto.start_now !== true)
  @IsString()
  @Matches(LOCAL_DATE_TIME_PATTERN, {
    message: 'start_local must be formatted as YYYY-MM-DDTHH:mm',
  })
  @ApiPropertyOptional({ name: 'start_local' })
  start_local?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-840)
  @Max(840)
  @ApiPropertyOptional({ name: 'start_offset_minutes' })
  start_offset_minutes?: number;

  @IsString()
  @Matches(LOCAL_DATE_TIME_PATTERN, {
    message: 'end_local must be formatted as YYYY-MM-DDTHH:mm',
  })
  @ApiProperty({ name: 'end_local' })
  end_local!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-840)
  @Max(840)
  @ApiPropertyOptional({ name: 'end_offset_minutes' })
  end_offset_minutes?: number;
}
