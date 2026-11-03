import type { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  OutboxEventEntity,
  OutboxEventStatus,
} from '~/platform/outbox/outbox-event.entity';
import {
  LABEL_CHARGED_OUTBOX_EVENT_NAME,
  LABEL_OUTBOX_AGGREGATE_TYPE,
  LABEL_REFUNDED_OUTBOX_EVENT_NAME,
  buildLabelMoneyEvent,
  type LabelMoneyEventInput,
} from '../events/label-money-event';

/**
 * Publishes a Label's charge or refund as a durable Finance money event. Both
 * writes use the caller's EntityManager, so the Label fact and its money event
 * commit in the same transaction.
 */
@Injectable()
export class LabelMoneyEventOutboxService {
  async createLabelChargedEvent(
    entityManager: EntityManager,
    input: LabelMoneyEventInput,
  ): Promise<OutboxEventEntity> {
    return this.publish(entityManager, LABEL_CHARGED_OUTBOX_EVENT_NAME, input);
  }

  async createLabelRefundedEvent(
    entityManager: EntityManager,
    input: LabelMoneyEventInput,
  ): Promise<OutboxEventEntity> {
    return this.publish(entityManager, LABEL_REFUNDED_OUTBOX_EVENT_NAME, input);
  }

  private async publish(
    entityManager: EntityManager,
    eventName: string,
    input: LabelMoneyEventInput,
  ): Promise<OutboxEventEntity> {
    const outboxEvent = entityManager.create(OutboxEventEntity, {
      eventName,
      aggregateType: LABEL_OUTBOX_AGGREGATE_TYPE,
      aggregateId: input.labelId,
      payload: {},
      status: OutboxEventStatus.PENDING,
      attemptCount: 0,
      availableAt: new Date(),
    });

    outboxEvent.payload = buildLabelMoneyEvent(input) as unknown as Record<string, unknown>;

    entityManager.persist(outboxEvent);
    await entityManager.flush();

    return outboxEvent;
  }
}
