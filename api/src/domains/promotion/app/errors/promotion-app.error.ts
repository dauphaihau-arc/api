import type { PromoCodeIneligibleReason } from '../../domain/enums/promo-code-ineligible-reason.enum';

/**
 * Application errors for the promotion apply/pricing workflows. They describe
 * why a use case could not proceed (lookup, policy, slot conflict, missing
 * rate), never an invalid entity, so they live in `app/` and are mapped to
 * HTTP only by the transport layer.
 */

export class PromotionCodeNotFoundError extends Error {
  constructor(code: string) {
    super(`Promotion code ${code} not found`);
  }
}

export class PromotionCodeNotApplicableError extends Error {
  constructor(
    code: string,
    /**
     * Why the shared evaluator rejected the code, when that is known. The
     * transport layer returns it so a client can render its own precise copy
     * instead of the fallback message, which cannot distinguish the reasons.
     */
    readonly reason?: PromoCodeIneligibleReason,
  ) {
    super(`Promotion code ${code} cannot be applied to this cart`);
  }
}

/**
 * The requested Promo Codes cannot coexist in one shop cart: either more than
 * two manual codes, or two codes that occupy the same slot.
 */
export class PromotionSlotConflictError extends Error {
  constructor(code: string) {
    super(`Promotion code ${code} cannot be combined with the selected promotion codes`);
  }
}

/**
 * A requested Promo Code's monetary fields cannot be expressed in the checkout
 * currency because no exchange rate is available. The code is never applied
 * with its native amount treated as the checkout currency: the buyer either
 * loses the discount silently or pays a wrong price, so the request fails.
 */
export class PromotionCurrencyConversionUnavailableError extends Error {
  constructor(
    readonly code: string,
    readonly promotionCurrency: string,
    readonly checkoutCurrency: string,
  ) {
    super(
      `Promotion code ${code} is priced in ${promotionCurrency} and cannot be converted to ${checkoutCurrency}`,
    );
  }
}

export type PromotionAppError =
  | PromotionCodeNotFoundError
  | PromotionCodeNotApplicableError
  | PromotionSlotConflictError
  | PromotionCurrencyConversionUnavailableError;
