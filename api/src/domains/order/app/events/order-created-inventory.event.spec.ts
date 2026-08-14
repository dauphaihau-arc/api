import {
  ORDER_CREATED_INVENTORY_PRODUCER,
  ORDER_CREATED_INVENTORY_ROUTING_KEY,
  ORDER_CREATED_INVENTORY_EVENT_TYPE,
  buildOrderCreatedInventoryEvent,
} from './order-created-inventory.event';

describe('buildOrderCreatedInventoryEvent', () => {
  it('builds the RabbitMQ order.created inventory event envelope', () => {
    const event = buildOrderCreatedInventoryEvent({
      eventId: 'event-1',
      occurredAt: new Date('2026-08-12T05:31:19.013Z'),
      orderIds: ['order-1', 'order-2'],
      quoteId: 'quote-1',
      reservationId: 'reservation-1',
      items: [
        {
          inventoryId: 'inventory-1',
          quantity: 1,
        },
      ],
    });

    expect(ORDER_CREATED_INVENTORY_ROUTING_KEY).toBe('order.created');
    expect(event).toEqual({
      eventId: 'event-1',
      eventType: ORDER_CREATED_INVENTORY_EVENT_TYPE,
      occurredAt: '2026-08-12T05:31:19.013Z',
      producer: ORDER_CREATED_INVENTORY_PRODUCER,
      payload: {
        orderIds: ['order-1', 'order-2'],
        quoteId: 'quote-1',
        reservationId: 'reservation-1',
        items: [
          {
            inventoryId: 'inventory-1',
            quantity: 1,
          },
        ],
      },
    });
  });
});
