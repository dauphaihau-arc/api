/**
 * Which Products a Promotion targets.
 *
 * `all` covers every current Product of the owning shop plus Products
 * published later, so new merchandise participates without editing the
 * Promotion. `specific` covers only the explicitly selected Products; an
 * eligible Product always includes each of its purchasable Product Variants.
 */
export enum PromotionProductScope {
  ALL = 'all',
  SPECIFIC = 'specific',
}
