/**
 * What a Promotion does when it applies.
 *
 * A `sale` reduces the current regular price of its targeted Products during
 * its Promotion Period without buyer input. A `checkout_discount` grants a
 * conditional benefit at checkout through its single Promo Code. Both are
 * applications of one Promotion model, never separate pricing engines.
 */
export enum PromotionApplicationKind {
  SALE = 'sale',
  CHECKOUT_DISCOUNT = 'checkout_discount',
}
