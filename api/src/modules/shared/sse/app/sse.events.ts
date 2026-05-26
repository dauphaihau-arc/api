export const SSE_ORDER_UPDATED_EVENT = 'sse.order.updated';

export const ORDER_SSE_CHANGED_FIELDS = [
  'status',
  'shippingStatus',
  'trackingNumber',
  'supportNote',
  'refundStatus',
] as const;

export type OrderSseChangedField = (typeof ORDER_SSE_CHANGED_FIELDS)[number];

export type OrderUpdatedSseEventPayload = {
  userId: string;
  orderId: string;
  changed: OrderSseChangedField[];
  status?: string;
  shippingStatus?: string;
  occurredAt?: string;
};
