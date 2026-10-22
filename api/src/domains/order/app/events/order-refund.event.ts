export const ORDER_REFUND_OUTBOX_EVENT_NAME = 'order.refunded';

/**
 * The money facts one succeeded Order Refund carries into Finance: the refund
 * fact's identity (which keys its Journal Entry), the Order it belongs to, and
 * the amount the provider actually returned in the currency the buyer paid.
 */
export interface OrderRefundEventInput {
  refundId: string;
  orderId: string;
  orderPublicId: string;
  shopId: string;
  currency: string;
  refundedAmountMinor: number;
  occurredAt: Date;
}

/** The same facts as the outbox payload, with the instant serialised. */
export interface OrderRefundEventPayload extends Omit<OrderRefundEventInput, 'occurredAt'> {
  occurredAt: string;
}

export function buildOrderRefundEvent(
  input: OrderRefundEventInput,
): OrderRefundEventPayload {
  return {
    refundId: input.refundId,
    orderId: input.orderId,
    orderPublicId: input.orderPublicId,
    shopId: input.shopId,
    currency: input.currency,
    refundedAmountMinor: input.refundedAmountMinor,
    occurredAt: input.occurredAt.toISOString(),
  };
}
