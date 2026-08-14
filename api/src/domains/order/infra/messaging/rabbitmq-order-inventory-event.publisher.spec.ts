import { RabbitMqOrderInventoryEventPublisher } from './rabbitmq-order-inventory-event.publisher';

describe('RabbitMqOrderInventoryEventPublisher', () => {
  it('publishes order.created inventory events to the configured exchange', async () => {
    const channel = {
      assertExchange: jest.fn().mockResolvedValue(undefined),
      assertQueue: jest.fn().mockResolvedValue(undefined),
      bindQueue: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn().mockReturnValue(true),
      waitForConfirms: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const connection = {
      createConfirmChannel: jest.fn().mockResolvedValue(channel),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const connectFn = jest.fn().mockResolvedValue(connection);
    const publisher = new RabbitMqOrderInventoryEventPublisher(
      {
        url: 'amqp://rabbitmq',
        domainEventsExchange: 'arc.domain-events',
        inventoryOrderEventsQueue: 'inventory.order-events',
      },
      connectFn as never,
    );

    await publisher.publish({
      eventId: 'event-1',
      eventType: 'order.created',
      occurredAt: '2026-08-12T05:31:19.013Z',
      producer: 'arc-api',
      payload: {
        orderIds: ['order-1'],
        quoteId: 'quote-1',
        reservationId: 'reservation-1',
        items: [{ inventoryId: 'inventory-1', quantity: 1 }],
      },
    });

    expect(connectFn).toHaveBeenCalledWith('amqp://rabbitmq');
    expect(channel.assertExchange).toHaveBeenCalledWith(
      'arc.domain-events',
      'topic',
      { durable: true },
    );
    expect(channel.assertQueue).toHaveBeenCalledWith(
      'inventory.order-events',
      { durable: true },
    );
    expect(channel.bindQueue).toHaveBeenCalledWith(
      'inventory.order-events',
      'arc.domain-events',
      'order.created',
    );
    expect(channel.publish).toHaveBeenCalledWith(
      'arc.domain-events',
      'order.created',
      expect.any(Buffer),
      expect.objectContaining({
        contentType: 'application/json',
        messageId: 'event-1',
        persistent: true,
        type: 'order.created',
      }),
    );
    expect(channel.waitForConfirms).toHaveBeenCalled();
  });
});
