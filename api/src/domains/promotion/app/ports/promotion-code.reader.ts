import type { PromotionBenefitType } from '../../domain/enums/promotion-benefit-type.enum';
import type { PromotionProductScope } from '../../domain/enums/promotion-product-scope.enum';
import type { PromotionVisibility } from '../../domain/enums/promotion-visibility.enum';

/**
 * A Checkout Discount offer reachable through its single Promo Code. This is
 * the shape the coupon-pricing path consumes: it carries the Promotion's
 * benefit, scope, schedule and the normalized code identity in one place.
 */
export interface PromotionCodeOffer {
  promotionId: string;
  shopId: string;
  code: string;
  benefitType: PromotionBenefitType;
  percentOff: number;
  amountOff: number;
  currency: string;
  visibility: PromotionVisibility;
  productScope: PromotionProductScope;
  productIds: string[];
  startAt: Date;
  endAt: Date;
  timezone: string;
}

export interface FindActiveCheckoutDiscountsInput {
  shopIds: string[];
  at?: Date;
}

/**
 * Read port for checkout discount resolution. Returns every active Checkout
 * Discount (one code each) for the requested shops so the pricing path can
 * match buyer-entered codes case-insensitively against both legacy Coupons and
 * Promotion-backed codes.
 */
export abstract class PromotionCodeReader {
  abstract findActiveCheckoutDiscounts(
    input: FindActiveCheckoutDiscountsInput,
  ): Promise<PromotionCodeOffer[]>;
}
