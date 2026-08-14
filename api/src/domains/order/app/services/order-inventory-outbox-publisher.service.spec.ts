import type { EntityManager } from '@mikro-orm/postgresql';
import type { OrderInventoryEventPublisher } from '../ports/order-inventory-event.publisher';
import { OutboxEventStatus } from '../../infra/persistence/entities/outbox-event.entity';
import { OrderInventoryOutboxPublisherService } from './order-inventory-outbox-publisher.service';

describe('OrderInventoryOutboxPublisherService', () => {
  it('publishes an inventory outbox event and marks it processed', async () => {
    const { service, event, publisher } = buildService();

    await expect(service.processEventById('event-1')).resolves.toBe(true);

    expect(publisher.publish).toHaveBeenCalledWith(event.payload);
    expect(event.status).toBe(OutboxEventStatus.PROCESSED);
    expect(event.processedAt).toBeInstanceOf(Date);
  });

  it('reschedules the event when RabbitMQ publish fails', async () => {
    const { service, event, publisher } = buildService();
    publisher.publish.mockRejectedValue(new Error('RabbitMQ down'));
    const loggerErrorSpy = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => undefined);

    await expect(service.processEventById('event-1')).resolves.toBe(false);

    expect(event.status).toBe(OutboxEventStatus.PENDING);
    expect(event.attemptCount).toBe(1);
    expect(event.lastError).toBe('RabbitMQ down');
    expect(event.availableAt.getTime()).toBeGreaterThan(Date.now());
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Failed publishing inventory outbox event event-1: RabbitMQ down',
      expect.any(String),
    );
  });

  it('processes pending order.created events in creation order', async () => {
    const { service, entityManager, event } = buildService();
    entityManager.find.mockResolvedValue([event]);

    await expect(service.processPendingEvents(10)).resolves.toBe(1);

    expect(entityManager.find).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        eventName: 'order.created',
        status: OutboxEventStatus.PENDING,
      }),
      expect.objectContaining({
        orderBy: { createdAt: 'asc' },
        limit: 10,
      }),
    );
  });
});

function buildService() {
  const event = {
    id: 'event-1',
    eventName: 'order.created',
    status: OutboxEventStatus.PENDING,
    attemptCount: 0,
    availableAt: new Date(Date.now() - 1_000),
    processedAt: undefined as Date | undefined,
    lastError: undefined as string | undefined,
    payload: {
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
    },
  };
  const fakeEntityManager = {
    flush: jest.fn().mockResolvedValue(undefined),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(event),
    findOneOrFail: jest.fn().mockResolvedValue(event),
    transactional: jest.fn(async (callback: (em: EntityManager) => Promise<unknown>) =>
      callback(fakeEntityManager as unknown as EntityManager)),
  };
  const entityManager = {
    ...fakeEntityManager,
    fork: jest.fn(() => ({
      ...fakeEntityManager,
      transactional: jest.fn(async (callback: (em: EntityManager) => Promise<unknown>) =>
        callback(fakeEntityManager as unknown as EntityManager)),
    })),
  } as unknown as jest.Mocked<EntityManager>;
  const publisher = {
    publish: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<OrderInventoryEventPublisher>;
  const service = new OrderInventoryOutboxPublisherService(
    entityManager,
    publisher,
  );

  return {
    service,
    entityManager,
    event,
    publisher,
  };
}
