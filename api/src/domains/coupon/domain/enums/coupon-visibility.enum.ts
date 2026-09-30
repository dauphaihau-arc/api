/**
 * Who may discover a Coupon on its own.
 *
 * `public` Coupons are eligible for the shopper-facing coupon listing, so a
 * buyer can pick them from the checkout UI. `code_only` Coupons are redeemed
 * only when a buyer already holds the code, so they never appear in a listing.
 */
export enum CouponVisibility {
  PUBLIC = 'public',
  CODE_ONLY = 'code_only',
}
