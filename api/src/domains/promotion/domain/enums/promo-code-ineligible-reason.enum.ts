/**
 * Why a discoverable Promo Code cannot be redeemed on the current cart.
 *
 * A Promo Code is only returned by the shopper-facing listing with one of these
 * reasons; the listing never hides a public code for a cart-dependent rule, so
 * the buyer can see why a code is unavailable. The apply path evaluates the
 * same rules, so a reason here always matches the rejection a redemption would
 * produce. Reasons are evaluated in declaration order and the first match wins.
 */
export enum PromoCodeIneligibleReason {
  /** The Promotion's `start_at` is still in the future. */
  NOT_STARTED = 'not_started',
  /** The Promotion's `end_at` is in the past. The listing excludes these
   * outright, so this only ever surfaces from the shared evaluator on the
   * apply path. */
  EXPIRED = 'expired',
  /** The Promotion has reached its global redemption limit. */
  USAGE_LIMIT_REACHED = 'usage_limit_reached',
  /** The buyer has reached the Promotion's per-buyer redemption limit. */
  USER_USAGE_LIMIT_REACHED = 'user_usage_limit_reached',
  /**
   * The Promo Code carries a per-buyer limit, which only an authenticated
   * buyer account can satisfy.
   */
  AUTHENTICATION_REQUIRED = 'authentication_required',
  /** No selected cart item matches the Promotion's product scope. */
  PRODUCT_SCOPE = 'product_scope',
  /** The eligible subtotal is below the Promotion's converted order-total minimum. */
  MIN_ORDER_VALUE = 'min_order_value',
  /** The eligible quantity is below the Promotion's product-count minimum. */
  MIN_PRODUCTS = 'min_products',
  /**
   * The Promo Code grants no monetary saving on the current cart after pricing
   * and rounding, so applying it would consume an allowance for nothing.
   */
  ZERO_BENEFIT = 'zero_benefit',
}
