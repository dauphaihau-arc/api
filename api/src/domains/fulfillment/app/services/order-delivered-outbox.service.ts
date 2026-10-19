import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  OutboxEventEntity,
  OutboxEventStatus,
} from '~/platform/outbox/outbox-event.entity';
import {
  ORDER_DELIVERED_OUTBOX_AGGREGATE_TYPE,
  ORDER_DELIVERED_OUTBOX_EVENT_NAME,
  buildOrderDeliveredEvent,
  type OrderDeliveredEventInput,
} from '../events/order-delivered.event';

/**
 * Publishes the durable `order.delivered` fact through the shared outbox table.
 * The event is written with the caller's EntityManager so the delivery fact and
 * its event commit in the same transaction.
 */
@Injectable()
export class OrderDeliveredOutboxService {
  async createOrderDeliveredEvent(
    entityManager: EntityManager,
    input: OrderDeliveredEventInput,
  ): Promise<OutboxEventEntity> {
    const outboxEvent = entityManager.create(OutboxEventEntity, {
      eventName: ORDER_DELIVERED_OUTBOX_EVENT_NAME,
      aggregateType: ORDER_DELIVERED_OUTBOX_AGGREGATE_TYPE,
      aggregateId: input.orderId,
      payload: {},
      status: OutboxEventStatus.PENDING,
      attemptCount: 0,
      availableAt: new Date(),
    });

    outboxEvent.payload = buildOrderDeliveredEvent(input) as unknown as Record<string, unknown>;

    entityManager.persist(outboxEvent);
    await entityManager.flush();

    return outboxEvent;
  }
}
