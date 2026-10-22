/**
 * The `order.refunded` money event payload as Finance consumes it. Producer: the
 * Order domain's Order Refund outbox (`domains/order/app/events/order-refund.event.ts`);
 * Finance defines its own copy of the shape so it never imports the producer's type.
 *
 * The refund fact's id is the Money Event identity: redelivering the same event
 * resolves the same Journal Entry key and records nothing further.
 */
export interface OrderRefundMoneyEvent {
  refundId: string;
  orderId: string;
  orderPublicId: string;
  shopId: string;
  currency: string;
  refundedAmountMinor: number;
  occurredAt: string;
}

/** The outbox event name Finance owns for succeeded Order Refunds. */
export const ORDER_REFUND_MONEY_EVENT_NAME = 'order.refunded';
