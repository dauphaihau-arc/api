export const ORDER_UPDATED_SSE_EVENT = 'sse.order.updated';

export const ORDER_SSE_CHANGED_FIELDS = [
  'status',
  'fulfillment',
  'supportNote',
  'refundStatus',
] as const;

export type OrderSseChangedField = (typeof ORDER_SSE_CHANGED_FIELDS)[number];

export type OrderUpdatedSseEventPayload = {
  userId: string;
  orderId: string;
  changed: OrderSseChangedField[];
  status?: string;
  fulfillmentStatus?: string;
  occurredAt?: string;
};
