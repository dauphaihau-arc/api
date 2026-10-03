/**
 * Why a discoverable Coupon cannot be redeemed on the current cart.
 *
 * A Coupon is only returned by the shopper-facing listing with one of these
 * reasons; the listing never hides a public Coupon for a cart-dependent rule,
 * so the buyer can see why a code is unavailable. The apply path evaluates the
 * same rules, so a reason here always matches the rejection a redemption would
 * produce. Reasons are evaluated in declaration order and the first match wins.
 */
export enum CouponIneligibleReason {
  /** The Coupon's `start_date` is still in the future. */
  NOT_STARTED = 'not_started',
  /** The Coupon's `end_date` is in the past. The listing excludes these
   * outright, so this only ever surfaces from the shared evaluator on the
   * apply path. */
  EXPIRED = 'expired',
  /** The Coupon is deactivated by its seller. */
  INACTIVE = 'inactive',
  /** The Coupon has reached its global redemption limit. */
  USAGE_LIMIT_REACHED = 'usage_limit_reached',
  /** The buyer has reached the Coupon's per-user redemption limit. */
  USER_USAGE_LIMIT_REACHED = 'user_usage_limit_reached',
  /** No selected cart item matches the Coupon's product scope. */
  PRODUCT_SCOPE = 'product_scope',
  /** The eligible subtotal is below the Coupon's converted order-total minimum. */
  MIN_ORDER_VALUE = 'min_order_value',
  /** The eligible quantity is below the Coupon's product-count minimum. */
  MIN_PRODUCTS = 'min_products',
  /**
   * The Coupon grants no monetary saving on the current cart after pricing and
   * rounding, so applying it would consume an allowance for nothing.
   */
  ZERO_BENEFIT = 'zero_benefit',
}
