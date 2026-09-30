/**
 * The benefit a Promotion grants. A Sale is percentage-only; a Checkout
 * Discount may grant a percentage, a fixed amount, or free shipping.
 */
export enum PromotionBenefitType {
  PERCENTAGE = 'percentage',
  FIXED_AMOUNT = 'fixed_amount',
  FREE_SHIPPING = 'free_shipping',
}
