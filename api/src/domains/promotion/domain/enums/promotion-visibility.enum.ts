/**
 * Whether a Checkout Discount's Promo Code is publicly discoverable in
 * checkout or unlisted and shared directly. Visibility never changes
 * redemption eligibility: a public code the buyer does not qualify for stays
 * unselectable.
 */
export enum PromotionVisibility {
  PUBLIC = 'public',
  CODE_ONLY = 'code_only',
}
