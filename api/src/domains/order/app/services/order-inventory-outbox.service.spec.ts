import type { EntityManager } from '@mikro-orm/postgresql';
import { ORDER_CREATED_INVENTORY_EVENT_TYPE } from '../events/order-created-inventory.event';
import { OutboxEventStatus } from '../../infra/persistence/entities/outbox-event.entity';
import { OrderInventoryOutboxService } from './order-inventory-outbox.service';

describe('OrderInventoryOutboxService', () => {
  it('persists an order.created inventory outbox event', async () => {
    const outboxEvent = {
      id: 'event-1',
      payload: {},
    };
    const entityManager = {
      create: jest.fn().mockReturnValue(outboxEvent),
      persist: jest.fn(),
      flush: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EntityManager>;
    const service = new OrderInventoryOutboxService();

    const result = await service.createOrderCreatedEvent(entityManager, {
      orderIds: ['order-1'],
      quoteId: 'quote-1',
      reservationId: 'reservation-1',
      items: [{ inventoryId: 'inventory-1', quantity: 2 }],
    });

    expect(entityManager.create).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        eventName: ORDER_CREATED_INVENTORY_EVENT_TYPE,
        aggregateType: 'order',
        aggregateId: 'order-1',
        status: OutboxEventStatus.PENDING,
        attemptCount: 0,
      }),
    );
    expect(outboxEvent.payload).toEqual({
      eventId: 'event-1',
      eventType: ORDER_CREATED_INVENTORY_EVENT_TYPE,
      occurredAt: expect.any(String),
      producer: 'arc-api',
      payload: {
        orderIds: ['order-1'],
        quoteId: 'quote-1',
        reservationId: 'reservation-1',
        items: [{ inventoryId: 'inventory-1', quantity: 2 }],
      },
    });
    expect(entityManager.persist).toHaveBeenCalledWith(outboxEvent);
    expect(entityManager.flush).toHaveBeenCalled();
    expect(result).toBe(outboxEvent);
  });
});
