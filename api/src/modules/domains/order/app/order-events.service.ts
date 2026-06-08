import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { OrderEventActorType } from '../domain/enums/order-event-actor-type.enum';
import { OrderEventType } from '../domain/enums/order-event-type.enum';
import { OrderEventEntity } from '../infra/persistence/entities/order-event.entity';
import { OrderEntity } from '../infra/persistence/entities/order.entity';
import type { OrderTimelineEvent } from './order.types';

type RecordOrderEventInput = {
  order: OrderEntity;
  type: OrderEventType;
  actorType: OrderEventActorType;
  actorId?: string;
  source?: string;
  occurredAt?: Date;
  payload?: Record<string, unknown>;
};

@Injectable()
export class OrderEventsService {
  async record(
    entityManager: EntityManager,
    input: RecordOrderEventInput
  ): Promise<void> {
    const event = entityManager.create(OrderEventEntity, {
      order: input.order,
      type: input.type,
      occurredAt: input.occurredAt ?? new Date(),
      actorType: input.actorType,
      actorId: input.actorId,
      source: input.source,
      payload: input.payload,
    });

    entityManager.persist(event);
  }

  async listForOrder(
    entityManager: EntityManager,
    orderId: string
  ): Promise<OrderTimelineEvent[]> {
    const events = await entityManager.find(
      OrderEventEntity,
      { order: orderId },
      { orderBy: { occurredAt: 'asc', id: 'asc' } }
    );

    return events.map((event) => ({
      id: event.id,
      type: event.type,
      occurredAt: event.occurredAt,
      actorType: event.actorType,
      actorId: event.actorId,
      source: event.source,
      payload: event.payload,
    }));
  }
}
