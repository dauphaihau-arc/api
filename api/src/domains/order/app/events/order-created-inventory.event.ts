export const ORDER_CREATED_INVENTORY_EVENT_TYPE = 'order.created';
export const ORDER_CREATED_INVENTORY_ROUTING_KEY = 'order.created';
export const ORDER_CREATED_INVENTORY_PRODUCER = 'arc-api';

export interface OrderCreatedInventoryEventItem {
  inventoryId: string;
  quantity: number;
}

export interface OrderCreatedInventoryEventPayload {
  orderIds: string[];
  quoteId: string;
  reservationId?: string;
  items: OrderCreatedInventoryEventItem[];
}

export interface OrderCreatedInventoryEvent {
  eventId: string;
  eventType: typeof ORDER_CREATED_INVENTORY_EVENT_TYPE;
  occurredAt: string;
  producer: typeof ORDER_CREATED_INVENTORY_PRODUCER;
  payload: OrderCreatedInventoryEventPayload;
}

export function buildOrderCreatedInventoryEvent(input: {
  eventId: string;
  occurredAt?: Date;
  orderIds: string[];
  quoteId: string;
  reservationId?: string;
  items: OrderCreatedInventoryEventItem[];
}): OrderCreatedInventoryEvent {
  return {
    eventId: input.eventId,
    eventType: ORDER_CREATED_INVENTORY_EVENT_TYPE,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    producer: ORDER_CREATED_INVENTORY_PRODUCER,
    payload: {
      orderIds: input.orderIds,
      quoteId: input.quoteId,
      ...(input.reservationId ? { reservationId: input.reservationId } : {}),
      items: input.items,
    },
  };
}
