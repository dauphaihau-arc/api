/**
 * The condition a Checkout Discount places on the buyer's checkout. A Sale is
 * unconditional and always uses `none`.
 *
 * `order_total` compares the Eligible Merchandise Subtotal after Sale pricing
 * and before Promo Code discounts. `purchase_quantity` counts eligible
 * merchandise units, not distinct Products.
 */
export enum PromotionMinOrderType {
  NONE = 'none',
  PURCHASE_QUANTITY = 'purchase_quantity',
  ORDER_TOTAL = 'order_total',
}
