import type {
  AppliedPromoCode,
  DiscoverablePromoCode,
} from '~/domains/promotion/app/types/promotion.types';

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
