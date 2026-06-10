import {
  Entity, Enum, Index, ManyToOne, Property 
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/common/database/abstract-base.entity';
import { OrderEventActorType } from '../../../domain/enums/order-event-actor-type.enum';
import { OrderEventType } from '../../../domain/enums/order-event-type.enum';
import { OrderEntity } from './order.entity';

@Entity({ tableName: 'order_events' })
@Index({ properties: ['order', 'occurredAt'] })
export class OrderEventEntity extends AbstractBaseEntity {
  @ManyToOne(() => OrderEntity, {
    fieldName: 'order_id',
    deleteRule: 'cascade',
  })
  order!: OrderEntity;

  @Enum({ items: () => OrderEventType, fieldName: 'type' })
  type!: OrderEventType;

  @Property({ fieldName: 'occurred_at' })
  occurredAt = new Date();

  @Enum({ items: () => OrderEventActorType, fieldName: 'actor_type' })
  actorType!: OrderEventActorType;

  @Property({ fieldName: 'actor_id', nullable: true, length: 255 })
  actorId?: string;

  @Property({ nullable: true, length: 255 })
  source?: string;

  @Property({ type: 'json', nullable: true })
  payload?: Record<string, unknown>;
}
