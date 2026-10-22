import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  ORDER_REFUND_OUTBOX_EVENT_NAME,
  buildOrderRefundEvent,
  type OrderRefundEventInput,
} from '../events/order-refund.event';
import {
  OutboxEventEntity,
  OutboxEventStatus,
} from '../../../../platform/outbox/outbox-event.entity';

const ORDER_REFUND_OUTBOX_AGGREGATE_TYPE = 'order_refund';

/**
 * Publishes a succeeded Order Refund as a durable money event. The write joins
 * the caller's transaction, so the refund fact, the Order projection, and the
 * event Finance consumes commit together or not at all.
 */
@Injectable()
export class OrderRefundOutboxService {
  async createOrderRefundedEvent(
    entityManager: EntityManager,
    input: OrderRefundEventInput,
  ): Promise<OutboxEventEntity> {
    const outboxEvent = entityManager.create(OutboxEventEntity, {
      eventName: ORDER_REFUND_OUTBOX_EVENT_NAME,
      aggregateType: ORDER_REFUND_OUTBOX_AGGREGATE_TYPE,
      aggregateId: input.refundId,
      payload: {},
      status: OutboxEventStatus.PENDING,
      attemptCount: 0,
      availableAt: new Date(),
    });

    outboxEvent.payload = buildOrderRefundEvent(input) as unknown as Record<string, unknown>;

    entityManager.persist(outboxEvent);
    await entityManager.flush();

    return outboxEvent;
  }
}
