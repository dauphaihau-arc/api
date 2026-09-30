import type {
  AppliedCoupon,
  DiscoverableCoupon,
} from '~/domains/coupon/app/types/coupon.types';

export function toCartCouponListResponse(coupons: DiscoverableCoupon[]) {
  return {
    coupons: coupons.map((coupon) => ({
      code: coupon.code,
      type: coupon.type,
      applies_to: coupon.appliesTo,
      amount_off: coupon.amountOff,
      percent_off: coupon.percentOff,
      min_order_type: coupon.minOrderType,
      min_order_value: coupon.minOrderValue,
      min_products: coupon.minProducts,
      end_date: coupon.endDate,
      currency: coupon.currency,
      is_eligible: coupon.isEligible,
      ineligible_reason: coupon.ineligibleReason,
    })),
  };
}

export function toCartPromoCodeResponse(
  promoCodes: string[],
  appliedCoupons: AppliedCoupon[],
) {
  return {
    promo_codes: promoCodes,
    applied_coupons: appliedCoupons.map((coupon) => ({
      code: coupon.code,
      type: coupon.type,
    })),
  };
}
