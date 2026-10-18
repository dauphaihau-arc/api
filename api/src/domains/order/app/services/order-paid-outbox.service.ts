import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  ORDER_PAID_OUTBOX_EVENT_NAME,
  buildOrderPaidEvent,
  type OrderPaidEventInput,
} from '../events/order-paid.event';
import {
  OutboxEventEntity,
  OutboxEventStatus,
} from '../../../../platform/outbox/outbox-event.entity';

const ORDER_PAID_OUTBOX_AGGREGATE_TYPE = 'order';

@Injectable()
export class OrderPaidOutboxService {
  async createOrderPaidEvent(
    entityManager: EntityManager,
    input: OrderPaidEventInput,
  ): Promise<OutboxEventEntity> {
    const outboxEvent = entityManager.create(OutboxEventEntity, {
      eventName: ORDER_PAID_OUTBOX_EVENT_NAME,
      aggregateType: ORDER_PAID_OUTBOX_AGGREGATE_TYPE,
      aggregateId: input.orderId,
      payload: {},
      status: OutboxEventStatus.PENDING,
      attemptCount: 0,
      availableAt: new Date(),
    });

    outboxEvent.payload = buildOrderPaidEvent(input) as unknown as Record<string, unknown>;

    entityManager.persist(outboxEvent);
    await entityManager.flush();

    return outboxEvent;
  }
}
