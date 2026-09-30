import type { CouponPresentmentAmounts, PricedCartItem } from '../../../order/app/order.types';
import {
  couponAppliesToProduct,
  couponMeetsMinimum,
  isCouponActive,
} from '../../../order/app/order.types';
import {
  MAX_MANUAL_COUPONS_PER_SHOP,
  manualCouponSlot,
  type ManualCouponSlot,
} from '../../domain/coupon-slot';
import { CouponIneligibleReason } from '../../domain/enums/coupon-ineligible-reason.enum';
import { CouponMinOrderType } from '../../domain/enums/coupon-min-order-type.enum';
import type { CouponEntity } from '../../infra/persistence/entities/coupon.entity';
import { CouponSlotConflictError } from '../errors/coupon-app.error';
import type { DiscoverableCoupon } from '../types/coupon.types';

/**
 * The single eligibility verdict shared by the listing and the apply path, so
 * the two can never disagree about whether a Coupon is redeemable.
 */
export type CouponEligibility =
  | {
    outcome: 'eligible';
    amounts: CouponPresentmentAmounts;
    eligibleSubtotal: number;
    eligibleQuantity: number;
  }
  | { outcome: 'ineligible'; reason: CouponIneligibleReason }
  | { outcome: 'conversion_unavailable' };

/**
 * The one eligibility rule the listing and the pricing path share, so a Coupon
 * flagged ineligible in the listing is exactly the one a redemption rejects and
 * vice versa. Reason precedence matches the `CouponIneligibleReason` declaration
 * order; the pricing path resolves the Coupon's money before it checks the
 * global use limit and the minimums, so a missing rate fails as
 * `conversion_unavailable` ahead of those two reasons but never ahead of the
 * active, per-user limit, and scope checks.
 */
export function evaluateCoupon(input: {
  coupon: CouponEntity;
  items: PricedCartItem[];
  userUsageCount: number;
  amounts: CouponPresentmentAmounts | undefined;
  now: Date;
}): CouponEligibility {
  const {
    coupon, items, userUsageCount, amounts, now,
  } = input;

  if (!isCouponActive(coupon, now)) {
    if (coupon.startDate > now) {
      return { outcome: 'ineligible', reason: CouponIneligibleReason.NOT_STARTED };
    }
    if (coupon.endDate < now) {
      return { outcome: 'ineligible', reason: CouponIneligibleReason.EXPIRED };
    }

    return { outcome: 'ineligible', reason: CouponIneligibleReason.INACTIVE };
  }

  const userLimitOk = userUsageCount < coupon.maxUsesPerUser;
  const eligibleItems = items.filter((item) => couponAppliesToProduct(coupon, item.productId));
  const scopeOk = eligibleItems.length > 0;

  if (!amounts) {
    if (userLimitOk && scopeOk) {
      return { outcome: 'conversion_unavailable' };
    }
    if (!userLimitOk) {
      return { outcome: 'ineligible', reason: CouponIneligibleReason.USER_USAGE_LIMIT_REACHED };
    }

    return { outcome: 'ineligible', reason: CouponIneligibleReason.PRODUCT_SCOPE };
  }

  if (coupon.usesCount >= coupon.maxUses) {
    return { outcome: 'ineligible', reason: CouponIneligibleReason.USAGE_LIMIT_REACHED };
  }
  if (!userLimitOk) {
    return { outcome: 'ineligible', reason: CouponIneligibleReason.USER_USAGE_LIMIT_REACHED };
  }
  if (!scopeOk) {
    return { outcome: 'ineligible', reason: CouponIneligibleReason.PRODUCT_SCOPE };
  }

  const eligibleSubtotal = eligibleItems.reduce(
    (sum, item) => sum + (item.effectiveUnitPrice * item.quantity),
    0,
  );
  const eligibleQuantity = eligibleItems.reduce((sum, item) => sum + item.quantity, 0);

  if (
    coupon.minOrderType === CouponMinOrderType.ORDER_TOTAL
    && !couponMeetsMinimum(coupon, amounts, eligibleSubtotal, eligibleQuantity)
  ) {
    return { outcome: 'ineligible', reason: CouponIneligibleReason.MIN_ORDER_VALUE };
  }
  if (
    coupon.minOrderType === CouponMinOrderType.NUMBER_OF_PRODUCTS
    && !couponMeetsMinimum(coupon, amounts, eligibleSubtotal, eligibleQuantity)
  ) {
    return { outcome: 'ineligible', reason: CouponIneligibleReason.MIN_PRODUCTS };
  }

  return {
    outcome: 'eligible', amounts, eligibleSubtotal, eligibleQuantity,
  };
}

/**
 * The promo codes a shop cart would hold after adding `requested` alongside the
 * retained ones: adding a code atomically replaces any retained code in the same
 * slot. Codes that cannot be resolved are kept so validation rejects them
 * consistently instead of silently dropping the buyer's selection.
 */
export function nextPromoCodeSelection(input: {
  requested: CouponEntity;
  retainedCodes: string[];
  couponsByCode: Map<string, CouponEntity>;
}): string[] {
  const requestedSlot = manualCouponSlot(input.requested.type);
  const nextCodes: string[] = [];
  let replaced = false;

  for (const rawCode of input.retainedCodes) {
    const code = rawCode.trim().toUpperCase();
    if (!code || code === input.requested.code) {
      continue;
    }

    const retainedCoupon = input.couponsByCode.get(code);
    if (
      retainedCoupon
      && !retainedCoupon.isAutoSale
      && manualCouponSlot(retainedCoupon.type) === requestedSlot
    ) {
      if (!replaced) {
        nextCodes.push(input.requested.code);
        replaced = true;
      }
      continue;
    }

    nextCodes.push(code);
  }

  if (!replaced) {
    nextCodes.push(input.requested.code);
  }

  return nextCodes;
}

export function sortDiscoverableCoupons(coupons: DiscoverableCoupon[]): DiscoverableCoupon[] {
  return [...coupons].sort((left, right) => {
    if (left.isEligible !== right.isEligible) {
      return left.isEligible ? -1 : 1;
    }
    if (left.code === right.code) {
      return 0;
    }

    return left.code < right.code ? -1 : 1;
  });
}

export function assertManualCouponSlots(coupons: CouponEntity[]): void {
  if (coupons.length > MAX_MANUAL_COUPONS_PER_SHOP) {
    throw new CouponSlotConflictError(coupons[0].code);
  }

  const occupiedSlots = new Set<ManualCouponSlot>();
  for (const coupon of coupons) {
    const slot = manualCouponSlot(coupon.type);
    if (occupiedSlots.has(slot)) {
      throw new CouponSlotConflictError(coupon.code);
    }
    occupiedSlots.add(slot);
  }
}
