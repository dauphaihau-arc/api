/**
 * The redemption allowance rule for a Promo Code, evaluated against the counts
 * observed at the moment an Order is committed.
 *
 * A null limit means the dimension is unlimited. A per-buyer limit is a
 * buyer-specific condition, so it can only be satisfied by an authenticated
 * buyer account: browser identity, a cart session, or an unverified email never
 * establishes one. Both violations are distinct from lifecycle state; a code
 * whose allowance is spent is still Active or Ended, never a lifecycle of its
 * own.
 */

/** The applied Promo Code cannot consume another redemption. */
export class PromotionRedemptionLimitReachedError extends Error {
  constructor(readonly code: string) {
    super(`Promo Code "${code}" has reached its redemption limit`);
    this.name = 'PromotionRedemptionLimitReachedError';
  }
}

/** A per-buyer limit cannot be judged without an authenticated buyer. */
export class PromotionRedemptionRequiresAuthenticatedBuyerError extends Error {
  constructor(readonly code: string) {
    super(`Promo Code "${code}" has a per-buyer limit that requires an authenticated buyer`);
    this.name = 'PromotionRedemptionRequiresAuthenticatedBuyerError';
  }
}

export function assertRedemptionAllowed(input: {
  code: string;
  maxRedemptions: number | null;
  maxRedemptionsPerBuyer: number | null;
  totalCount: number;
  buyerCount: number;
  authenticated: boolean;
}): void {
  const {
    code, maxRedemptions, maxRedemptionsPerBuyer, totalCount, buyerCount, authenticated,
  } = input;

  if (maxRedemptions != null && totalCount >= maxRedemptions) {
    throw new PromotionRedemptionLimitReachedError(code);
  }

  if (maxRedemptionsPerBuyer == null) {
    return;
  }

  if (!authenticated) {
    throw new PromotionRedemptionRequiresAuthenticatedBuyerError(code);
  }

  if (buyerCount >= maxRedemptionsPerBuyer) {
    throw new PromotionRedemptionLimitReachedError(code);
  }
}
