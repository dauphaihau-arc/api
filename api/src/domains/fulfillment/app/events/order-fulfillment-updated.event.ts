export const ORDER_FULFILLMENT_UPDATED_EVENT = 'fulfillment.order.updated';

export type OrderFulfillmentUpdatedEventPayload = {
  orderId: string;
  shopId: string;
  customerUserId?: string;
};
