import type { CouponPresentmentAmounts, PricedCartItem } from '../../../order/app/order.types';
import { toMinorUnits } from '../../../../platform/money/money';
import {
  MAX_MANUAL_COUPONS_PER_SHOP,
  type ManualCouponSlot,
} from '../../domain/coupon-slot';
import { CouponIneligibleReason } from '../../domain/enums/coupon-ineligible-reason.enum';
import type { CouponEntity } from '../../infra/persistence/entities/coupon.entity';
import { CouponSlotConflictError } from '../errors/coupon-app.error';
import type {
  DiscoverableCoupon,
  ManualPromoOffer,
} from '../types/coupon.types';
import type { ManualPromoOfferType } from '../types/manual-promo-offer.mapper';
import { couponToManualOffer } from '../types/coupon.types';

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
 * The one eligibility rule the listing and the pricing path share, so an offer
 * flagged ineligible in the listing is exactly the one a redemption rejects and
 * vice versa. Reason precedence matches the `CouponIneligibleReason` declaration
 * order; the pricing path resolves the offer's money before it checks the
 * global use limit and the minimums, so a missing rate fails as
 * `conversion_unavailable` ahead of those two reasons but never ahead of the
 * active, per-user limit, and scope checks.
 */
export function evaluateManualPromoOffer(input: {
  offer: ManualPromoOffer;
  items: PricedCartItem[];
  userUsageCount: number;
  amounts: CouponPresentmentAmounts | undefined;
  checkoutCurrency: string;
  now: Date;
  /**
   * The owning shop's Shipping Charge in checkout minor units, when the caller
   * has already quoted shipping. A free-shipping code needs it to tell a real
   * waiver from an already-free charge; callers that have not quoted shipping
   * (cart-level apply or discovery) omit it and cannot yet judge that case.
   */
  shippingChargeMinor?: number;
}): CouponEligibility {
  const {
    offer, items, userUsageCount, amounts, checkoutCurrency, now, shippingChargeMinor,
  } = input;

  if (!isManualPromoOfferActive(offer, now)) {
    if (offer.startAt > now) {
      return { outcome: 'ineligible', reason: CouponIneligibleReason.NOT_STARTED };
    }
    if (offer.endAt < now) {
      return { outcome: 'ineligible', reason: CouponIneligibleReason.EXPIRED };
    }

    return { outcome: 'ineligible', reason: CouponIneligibleReason.INACTIVE };
  }

  const maxUsesPerUser = offer.maxUsesPerUser ?? Number.POSITIVE_INFINITY;
  const maxUses = offer.maxUses ?? Number.POSITIVE_INFINITY;
  const userLimitOk = userUsageCount < maxUsesPerUser;
  const eligibleItems = items.filter((item) => manualPromoOfferAppliesToProduct(offer, item.productId));
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

  if (offer.usesCount >= maxUses) {
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
    offer.minOrderType === 'order_total'
    && !manualPromoOfferMeetsMinimum(offer, amounts, eligibleSubtotal, eligibleQuantity)
  ) {
    return { outcome: 'ineligible', reason: CouponIneligibleReason.MIN_ORDER_VALUE };
  }
  if (
    offer.minOrderType === 'purchase_quantity'
    && !manualPromoOfferMeetsMinimum(offer, amounts, eligibleSubtotal, eligibleQuantity)
  ) {
    return { outcome: 'ineligible', reason: CouponIneligibleReason.MIN_PRODUCTS };
  }

  // A code that grants no saving after pricing and rounding is not a usable
  // offer: it must not consume an allowance or look selectable. A free-shipping
  // code is judged against the owning shop's Shipping Charge instead of
  // merchandise: an already-free charge leaves nothing to waive, so it is
  // zero-benefit too.
  if (offer.type === 'free_shipping') {
    if (shippingChargeMinor !== undefined && shippingChargeMinor <= 0) {
      return { outcome: 'ineligible', reason: CouponIneligibleReason.ZERO_BENEFIT };
    }
  }
  else {
    const discount = Math.min(
      eligibleSubtotal,
      computeManualPromoOfferDiscount(offer, amounts, eligibleSubtotal),
    );

    if (toMinorUnits(discount, checkoutCurrency) <= 0) {
      return { outcome: 'ineligible', reason: CouponIneligibleReason.ZERO_BENEFIT };
    }
  }

  return {
    outcome: 'eligible', amounts, eligibleSubtotal, eligibleQuantity,
  };
}

/**
 * Legacy Coupon adapter around the shared manual-promo rule.
 */
export function evaluateCoupon(input: {
  coupon: CouponEntity;
  items: PricedCartItem[];
  userUsageCount: number;
  amounts: CouponPresentmentAmounts | undefined;
  checkoutCurrency: string;
  now: Date;
  shippingChargeMinor?: number;
}): CouponEligibility {
  return evaluateManualPromoOffer({
    ...input,
    offer: couponToManualOffer(input.coupon),
  });
}

export function isManualPromoOfferActive(offer: ManualPromoOffer, now: Date): boolean {
  return offer.isActive && now >= offer.startAt && now <= offer.endAt;
}

export function manualPromoOfferAppliesToProduct(
  offer: ManualPromoOffer,
  productId: string,
): boolean {
  return offer.scope === 'all' || offer.productIds.includes(productId);
}

export function manualPromoOfferMeetsMinimum(
  offer: ManualPromoOffer,
  amounts: CouponPresentmentAmounts,
  subtotal: number,
  quantity: number,
): boolean {
  if (offer.minOrderType === 'order_total') {
    return subtotal >= amounts.minOrderValue;
  }

  if (offer.minOrderType === 'purchase_quantity') {
    return quantity >= offer.minPurchaseQuantity;
  }

  return true;
}

export function computeManualPromoOfferDiscount(
  offer: ManualPromoOffer,
  amounts: CouponPresentmentAmounts,
  subtotal: number,
): number {
  if (offer.type === 'percentage') {
    return subtotal * (offer.percentOff / 100);
  }

  if (offer.type === 'fixed_amount') {
    return amounts.amountOff;
  }

  return 0;
}

/**
 * The promo codes a shop cart would hold after adding `requested` alongside the
 * retained ones: adding a code atomically replaces any retained code in the same
 * slot. Codes that cannot be resolved are kept so validation rejects them
 * consistently instead of silently dropping the buyer's selection.
 */
export function nextPromoCodeSelection(input: {
  requested: ManualPromoOffer;
  retainedCodes: string[];
  offersByCode: Map<string, ManualPromoOffer>;
}): string[] {
  const requestedSlot = manualPromoOfferSlot(input.requested.type);
  const nextCodes: string[] = [];
  let replaced = false;

  for (const rawCode of input.retainedCodes) {
    const code = rawCode.trim().toUpperCase();
    if (!code || code === input.requested.code) {
      continue;
    }

    const retainedOffer = input.offersByCode.get(code);
    if (
      retainedOffer
      && manualPromoOfferSlot(retainedOffer.type) === requestedSlot
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

export function assertManualCouponSlots(offers: ManualPromoOffer[]): void {
  if (offers.length > MAX_MANUAL_COUPONS_PER_SHOP) {
    throw new CouponSlotConflictError(offers[0].code);
  }

  const occupiedSlots = new Set<ManualCouponSlot>();
  for (const offer of offers) {
    const slot = manualPromoOfferSlot(offer.type);
    if (occupiedSlots.has(slot)) {
      throw new CouponSlotConflictError(offer.code);
    }
    occupiedSlots.add(slot);
  }
}

export function manualPromoOfferSlot(type: ManualPromoOfferType): ManualCouponSlot {
  return type === 'free_shipping' ? 'shipping' : 'discount';
}
