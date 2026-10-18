/**
 * The `order.paid` money event payload as Finance consumes it. Producer: the
 * Order domain's paid-order money event (`domains/order/app/events/order-paid.event.ts`);
 * Finance defines its own copy of the shape so it never imports the producer's type.
 */
export interface OrderPaidMoneyEvent {
  orderId: string;
  orderPublicId: string;
  shopId: string;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  totalMinor: number;
  occurredAt: string;
}

/** The outbox event name Finance owns for paid Orders. */
export const ORDER_PAID_MONEY_EVENT_NAME = 'order.paid';
