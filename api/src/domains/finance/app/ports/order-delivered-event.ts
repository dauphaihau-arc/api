/**
 * The `order.delivered` event payload as Finance consumes it. Producer: the
 * Fulfillment/Order domain's delivered-order event; Finance defines its own
 * copy of the shape so it never imports the producer's type.
 */
export interface OrderDeliveredEvidence {
  shipmentId: string;
  shipmentPublicId: string;
  deliveredAt: string;
}

export interface OrderDeliveredEvent {
  orderId: string;
  deliveredAt: string;
  occurredAt: string;
  evidence: OrderDeliveredEvidence[];
}

/** The outbox event name Finance consumes for delivered Orders. */
export const ORDER_DELIVERED_OUTBOX_EVENT_NAME = 'order.delivered';
