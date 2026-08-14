import { buildRabbitMqConfig } from './rabbitmq.config';

describe('buildRabbitMqConfig', () => {
  it('uses local RabbitMQ defaults', () => {
    const config = buildRabbitMqConfig({
      get: jest.fn((_, fallback?: unknown) => fallback),
    });

    expect(config).toEqual({
      url: 'amqp://guest:guest@127.0.0.1:5672',
      domainEventsExchange: 'arc.domain-events',
      inventoryOrderEventsQueue: 'inventory.order-events',
    });
  });

  it('uses configured RabbitMQ values', () => {
    const values: Record<string, string | undefined> = {
      RABBITMQ_URL: 'amqp://user:pass@rabbitmq:5672',
      RABBITMQ_DOMAIN_EVENTS_EXCHANGE: 'custom.domain-events',
      RABBITMQ_INVENTORY_ORDER_EVENTS_QUEUE: 'custom.inventory-orders',
    };
    const config = buildRabbitMqConfig({
      get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
    });

    expect(config).toEqual({
      url: 'amqp://user:pass@rabbitmq:5672',
      domainEventsExchange: 'custom.domain-events',
      inventoryOrderEventsQueue: 'custom.inventory-orders',
    });
  });
});
