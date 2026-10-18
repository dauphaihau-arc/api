export const ORDER_PAID_OUTBOX_EVENT_NAME = 'order.paid';

/**
 * The money facts a paid Order carries into its money event: the Order's
 * identity, its shop, its currency, and the frozen minor-unit amounts it was
 * paid with.
 */
export interface OrderPaidEventInput {
  orderId: string;
  orderPublicId: string;
  shopId: string;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  totalMinor: number;
  occurredAt: Date;
}

/** The same facts as the outbox payload, with the instant serialised. */
export interface OrderPaidEventPayload extends Omit<OrderPaidEventInput, 'occurredAt'> {
  occurredAt: string;
}

export function buildOrderPaidEvent(
  input: OrderPaidEventInput,
): OrderPaidEventPayload {
  return {
    orderId: input.orderId,
    orderPublicId: input.orderPublicId,
    shopId: input.shopId,
    currency: input.currency,
    subtotalMinor: input.subtotalMinor,
    discountMinor: input.discountMinor,
    shippingMinor: input.shippingMinor,
    totalMinor: input.totalMinor,
    occurredAt: input.occurredAt.toISOString(),
  };
}
