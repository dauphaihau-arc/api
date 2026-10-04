import type { PromotionPresentmentAmounts, PricedCartItem } from '../../../order/app/order.types';
import { toMinorUnits } from '../../../../platform/money/money';
import {
  MAX_MANUAL_PROMO_CODES_PER_SHOP,
  type PromoCodeSlot,
} from '../../domain/promo-code-slot';

import { PromoCodeIneligibleReason } from '../../domain/enums/promo-code-ineligible-reason.enum';
import { PromotionSlotConflictError } from '../errors/promotion-app.error';
import type { DiscoverablePromoCode } from '../types/promotion.types';
import { PromotionBenefitType } from '../../domain/enums/promotion-benefit-type.enum';
import { PromotionProductScope } from '../../domain/enums/promotion-product-scope.enum';
import type { PromoOffer } from '../types/promo-offer.mapper';

/**
 * The single eligibility verdict shared by the listing and the apply path, so
 * the two can never disagree about whether a Promo Code is redeemable.
 */
export type PromoCodeEligibility =
  | {
    outcome: 'eligible';
    amounts: PromotionPresentmentAmounts;
    eligibleSubtotal: number;
    eligibleQuantity: number;
  }
  | { outcome: 'ineligible'; reason: PromoCodeIneligibleReason }
  | { outcome: 'conversion_unavailable' };

/**
 * The one eligibility rule the listing and the pricing path share, so an offer
 * flagged ineligible in the listing is exactly the one a redemption rejects and
 * vice versa. Reason precedence matches the `PromoCodeIneligibleReason`
 * declaration order; the pricing path resolves the offer's money before it
 * checks the global use limit and the minimums, so a missing rate fails as
 * `conversion_unavailable` ahead of those two reasons but never ahead of the
 * active, per-user limit, and scope checks.
 */
export function evaluatePromoOffer(input: {
  offer: PromoOffer;
  items: PricedCartItem[];
  userUsageCount: number;
  amounts: PromotionPresentmentAmounts | undefined;
  checkoutCurrency: string;
  now: Date;
  /**
   * The authenticated buyer's id, when there is one. A Promo Code with a
   * per-buyer limit can only be judged against a real account: a cart session,
   * browser identity, or unverified email never satisfies it.
   */
  authenticatedUserId?: string;
  /**
   * The owning shop's Shipping Charge in checkout minor units, when the caller
   * has already quoted shipping. A free-shipping code needs it to tell a real
   * waiver from an already-free charge; callers that have not quoted shipping
   * (cart-level apply or discovery) omit it and cannot yet judge that case.
   */
  shippingChargeMinor?: number;
}): PromoCodeEligibility {
  const {
    offer, items, userUsageCount, amounts, checkoutCurrency, now, shippingChargeMinor,
    authenticatedUserId,
  } = input;

  if (!isPromoOfferActive(offer, now)) {
    if (offer.startAt > now) {
      return { outcome: 'ineligible', reason: PromoCodeIneligibleReason.NOT_STARTED };
    }

    return { outcome: 'ineligible', reason: PromoCodeIneligibleReason.EXPIRED };
  }

  const maxUsesPerUser = offer.maxRedemptionsPerBuyer ?? Number.POSITIVE_INFINITY;
  const maxUses = offer.maxRedemptions ?? Number.POSITIVE_INFINITY;
  const userLimitOk = userUsageCount < maxUsesPerUser;
  const eligibleItems = items.filter((item) => promoOfferAppliesToProduct(offer, item.productId));
  const scopeOk = eligibleItems.length > 0;

  // A per-buyer Promo Code limit is a buyer-specific condition that only an
  // authenticated account can satisfy. This is evaluated with the other
  // buyer-specific reasons, ahead of conversion, so a signed-out buyer is told
  // to sign in rather than that the money could not be converted.
  if (offer.maxRedemptionsPerBuyer != null && !authenticatedUserId) {
    return { outcome: 'ineligible', reason: PromoCodeIneligibleReason.AUTHENTICATION_REQUIRED };
  }

  if (!amounts) {
    if (userLimitOk && scopeOk) {
      return { outcome: 'conversion_unavailable' };
    }
    if (!userLimitOk) {
      return { outcome: 'ineligible', reason: PromoCodeIneligibleReason.USER_USAGE_LIMIT_REACHED };
    }

    return { outcome: 'ineligible', reason: PromoCodeIneligibleReason.PRODUCT_SCOPE };
  }

  if (offer.redemptionCount >= maxUses) {
    return { outcome: 'ineligible', reason: PromoCodeIneligibleReason.USAGE_LIMIT_REACHED };
  }
  if (!userLimitOk) {
    return { outcome: 'ineligible', reason: PromoCodeIneligibleReason.USER_USAGE_LIMIT_REACHED };
  }
  if (!scopeOk) {
    return { outcome: 'ineligible', reason: PromoCodeIneligibleReason.PRODUCT_SCOPE };
  }

  const eligibleSubtotal = eligibleItems.reduce(
    (sum, item) => sum + (item.effectiveUnitPrice * item.quantity),
    0,
  );
  const eligibleQuantity = eligibleItems.reduce((sum, item) => sum + item.quantity, 0);

  if (
    offer.minOrderType === 'order_total'
    && !promoOfferMeetsMinimum(offer, amounts, eligibleSubtotal, eligibleQuantity)
  ) {
    return { outcome: 'ineligible', reason: PromoCodeIneligibleReason.MIN_ORDER_VALUE };
  }
  if (
    offer.minOrderType === 'purchase_quantity'
    && !promoOfferMeetsMinimum(offer, amounts, eligibleSubtotal, eligibleQuantity)
  ) {
    return { outcome: 'ineligible', reason: PromoCodeIneligibleReason.MIN_PRODUCTS };
  }

  // A code that grants no saving after pricing and rounding is not a usable
  // offer: it must not consume an allowance or look selectable. A free-shipping
  // code is judged against the owning shop's Shipping Charge instead of
  // merchandise: an already-free charge leaves nothing to waive, so it is
  // zero-benefit too.
  if (offer.benefitType === PromotionBenefitType.FREE_SHIPPING) {
    if (shippingChargeMinor !== undefined && shippingChargeMinor <= 0) {
      return { outcome: 'ineligible', reason: PromoCodeIneligibleReason.ZERO_BENEFIT };
    }
  }
  else {
    const discount = Math.min(
      eligibleSubtotal,
      computePromoOfferDiscount(offer, amounts, eligibleSubtotal),
    );

    if (toMinorUnits(discount, checkoutCurrency) <= 0) {
      return { outcome: 'ineligible', reason: PromoCodeIneligibleReason.ZERO_BENEFIT };
    }
  }

  return {
    outcome: 'eligible', amounts, eligibleSubtotal, eligibleQuantity,
  };
}

export function isPromoOfferActive(offer: PromoOffer, now: Date): boolean {
  return offer.isActive && now >= offer.startAt && now <= offer.endAt;
}

export function promoOfferAppliesToProduct(
  offer: PromoOffer,
  productId: string,
): boolean {
  return offer.productScope === PromotionProductScope.ALL || offer.productIds.includes(productId);
}

export function promoOfferMeetsMinimum(
  offer: PromoOffer,
  amounts: PromotionPresentmentAmounts,
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

export function computePromoOfferDiscount(
  offer: PromoOffer,
  amounts: PromotionPresentmentAmounts,
  subtotal: number,
): number {
  if (offer.benefitType === PromotionBenefitType.PERCENTAGE) {
    return subtotal * (offer.percentOff / 100);
  }

  if (offer.benefitType === PromotionBenefitType.FIXED_AMOUNT) {
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
  requested: PromoOffer;
  retainedCodes: string[];
  offersByCode: Map<string, PromoOffer>;
}): string[] {
  const requestedSlot = promoCodeSlot(input.requested.benefitType);
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
      && promoCodeSlot(retainedOffer.benefitType) === requestedSlot
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

export function sortDiscoverablePromoCodes(codes: DiscoverablePromoCode[]): DiscoverablePromoCode[] {
  return [...codes].sort((left, right) => {
    if (left.isEligible !== right.isEligible) {
      return left.isEligible ? -1 : 1;
    }
    if (left.code === right.code) {
      return 0;
    }

    return left.code < right.code ? -1 : 1;
  });
}

export function assertPromoCodeSlots(offers: PromoOffer[]): void {
  if (offers.length > MAX_MANUAL_PROMO_CODES_PER_SHOP) {
    throw new PromotionSlotConflictError(offers[0].code);
  }

  const occupiedSlots = new Set<PromoCodeSlot>();
  for (const offer of offers) {
    const slot = promoCodeSlot(offer.benefitType);
    if (occupiedSlots.has(slot)) {
      throw new PromotionSlotConflictError(offer.code);
    }
    occupiedSlots.add(slot);
  }
}

export function promoCodeSlot(benefitType: PromotionBenefitType): PromoCodeSlot {
  return benefitType === PromotionBenefitType.FREE_SHIPPING ? 'shipping' : 'discount';
}
