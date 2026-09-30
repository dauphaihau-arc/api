import { CouponType } from './enums/coupon-type.enum';

/**
 * A shop may combine at most two manually redeemed Coupons: one that waives
 * shipping and one that discounts merchandise. Coupons of the same slot never
 * stack, and automatic sale Coupons are a separate pricing mechanism that this
 * rule does not govern.
 */
export type ManualCouponSlot = 'shipping' | 'discount';

export const MAX_MANUAL_COUPONS_PER_SHOP = 2;

export function manualCouponSlot(type: CouponType): ManualCouponSlot {
  return type === CouponType.FREE_SHIP ? 'shipping' : 'discount';
}
