import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import type {
  AppliedPromoCode,
  DiscoverablePromoCode,
} from '~/domains/promotion/app/types/promotion.types';
import { PromotionBenefitType } from '~/domains/promotion/domain/enums/promotion-benefit-type.enum';
import { PromotionMinOrderType } from '~/domains/promotion/domain/enums/promotion-min-order-type.enum';
import { PromotionProductScope } from '~/domains/promotion/domain/enums/promotion-product-scope.enum';
import { PromoCodeIneligibleReason } from '~/domains/promotion/domain/enums/promo-code-ineligible-reason.enum';

export class CartPromoCodeResponseDto {
  @ApiProperty()
  code!: string;

  @ApiProperty({ enum: PromotionBenefitType })
  benefit_type!: PromotionBenefitType;

  @ApiProperty({ enum: PromotionProductScope })
  product_scope!: PromotionProductScope;

  @ApiProperty()
  amount_off!: number;

  @ApiProperty()
  percent_off!: number;

  @ApiProperty({ enum: PromotionMinOrderType })
  min_order_type!: PromotionMinOrderType;

  @ApiProperty()
  min_order_value!: number;

  @ApiProperty()
  min_purchase_quantity!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  end_date!: Date;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  is_eligible!: boolean;

  @ApiProperty({ enum: PromoCodeIneligibleReason, nullable: true })
  ineligible_reason!: PromoCodeIneligibleReason | null;
}

export class CartPromoCodeListResponseDto {
  @ApiProperty({ type: [CartPromoCodeResponseDto] })
  @Type(() => CartPromoCodeResponseDto)
  promo_codes!: CartPromoCodeResponseDto[];
}

export class CartAppliedPromoCodeResponseDto {
  @ApiProperty()
  code!: string;

  @ApiProperty({ enum: PromotionBenefitType })
  benefit_type!: PromotionBenefitType;
}

export class CartPromoCodeApplyResponseDto {
  @ApiProperty({ type: [String] })
  promo_codes!: string[];

  @ApiProperty({ type: [CartAppliedPromoCodeResponseDto] })
  @Type(() => CartAppliedPromoCodeResponseDto)
  applied_promo_codes!: CartAppliedPromoCodeResponseDto[];
}

export function toCartPromoCodeListResponse(promoCodes: DiscoverablePromoCode[]) {
  return {
    promo_codes: promoCodes.map((promoCode) => ({
      code: promoCode.code,
      benefit_type: promoCode.benefitType,
      product_scope: promoCode.productScope,
      amount_off: promoCode.amountOff,
      percent_off: promoCode.percentOff,
      min_order_type: promoCode.minOrderType,
      min_order_value: promoCode.minOrderValue,
      min_purchase_quantity: promoCode.minPurchaseQuantity,
      end_date: promoCode.endDate,
      currency: promoCode.currency,
      is_eligible: promoCode.isEligible,
      ineligible_reason: promoCode.ineligibleReason,
    })),
  };
}

export function toCartPromoCodeApplyResponse(
  promoCodes: string[],
  appliedPromoCodes: AppliedPromoCode[],
) {
  return {
    promo_codes: promoCodes,
    applied_promo_codes: appliedPromoCodes.map((promoCode) => ({
      code: promoCode.code,
      benefit_type: promoCode.benefitType,
    })),
  };
}
