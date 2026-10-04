import { PromotionBenefitType } from './enums/promotion-benefit-type.enum';

/**
 * A shop may combine at most two manually redeemed Promo Codes: one that waives
 * shipping and one that discounts merchandise. Promo Codes of the same slot
 * never stack.
 */
export type PromoCodeSlot = 'shipping' | 'discount';

export const MAX_MANUAL_PROMO_CODES_PER_SHOP = 2;

export function promoCodeSlot(type: PromotionBenefitType): PromoCodeSlot {
  return type === PromotionBenefitType.FREE_SHIPPING ? 'shipping' : 'discount';
}
