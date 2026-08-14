import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  ORDER_CREATED_INVENTORY_EVENT_TYPE,
  buildOrderCreatedInventoryEvent,
} from '../events/order-created-inventory.event';
import {
  OutboxEventEntity,
  OutboxEventStatus,
} from '../../infra/persistence/entities/outbox-event.entity';

const ORDER_INVENTORY_OUTBOX_AGGREGATE_TYPE = 'order';

export interface OrderCreatedInventoryOutboxInput {
  orderIds: string[];
  quoteId: string;
  reservationId?: string;
  items: Array<{
    inventoryId: string;
    quantity: number;
  }>;
}

@Injectable()
export class OrderInventoryOutboxService {
  async createOrderCreatedEvent(
    entityManager: EntityManager,
    input: OrderCreatedInventoryOutboxInput,
  ): Promise<OutboxEventEntity> {
    const outboxEvent = entityManager.create(OutboxEventEntity, {
      eventName: ORDER_CREATED_INVENTORY_EVENT_TYPE,
      aggregateType: ORDER_INVENTORY_OUTBOX_AGGREGATE_TYPE,
      aggregateId: input.orderIds[0] ?? input.quoteId,
      payload: {},
      status: OutboxEventStatus.PENDING,
      attemptCount: 0,
      availableAt: new Date(),
    });

    outboxEvent.payload = buildOrderCreatedInventoryEvent({
      eventId: outboxEvent.id,
      orderIds: input.orderIds,
      quoteId: input.quoteId,
      reservationId: input.reservationId,
      items: input.items,
    }) as unknown as Record<string, unknown>;

    entityManager.persist(outboxEvent);
    await entityManager.flush();

    return outboxEvent;
  }
}
