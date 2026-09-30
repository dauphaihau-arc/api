/**
 * Application errors for the coupon apply/pricing workflows. They describe why
 * a use case could not proceed (lookup, policy, slot conflict, missing rate),
 * never an invalid entity, so they live in `app/` and are mapped to HTTP only by
 * the transport layer.
 */

export class CouponCodeNotFoundError extends Error {
  constructor(code: string) {
    super(`Coupon code ${code} not found`);
  }
}

export class CouponCodeNotApplicableError extends Error {
  constructor(code: string) {
    super(`Coupon code ${code} cannot be applied to this cart`);
  }
}

/**
 * The requested Coupons cannot coexist in one shop cart: either more than two
 * manual Coupons, or two Coupons that occupy the same slot.
 */
export class CouponSlotConflictError extends Error {
  constructor(code: string) {
    super(`Coupon code ${code} cannot be combined with the selected coupons`);
  }
}

/**
 * A requested Coupon's monetary fields cannot be expressed in the checkout
 * currency because no exchange rate is available. The Coupon is never applied
 * with its native amount treated as the checkout currency: the buyer either
 * loses the discount silently or pays a wrong price, so the request fails.
 */
export class CouponCurrencyConversionUnavailableError extends Error {
  constructor(
    readonly code: string,
    readonly couponCurrency: string,
    readonly checkoutCurrency: string,
  ) {
    super(
      `Coupon code ${code} is priced in ${couponCurrency} and cannot be converted to ${checkoutCurrency}`,
    );
  }
}

export type CouponAppError =
  | CouponCodeNotFoundError
  | CouponCodeNotApplicableError
  | CouponSlotConflictError
  | CouponCurrencyConversionUnavailableError;
