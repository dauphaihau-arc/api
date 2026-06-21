import {
  Entity, Enum, Index, Property, 
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/common/database/abstract-base.entity';

export enum OutboxEventStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  FAILED = 'failed',
}

@Entity({ tableName: 'outbox_events' })
@Index({ properties: ['status', 'availableAt'] })
export class OutboxEventEntity extends AbstractBaseEntity {
  @Property({ fieldName: 'event_name', length: 255 })
  eventName!: string;

  @Property({ fieldName: 'aggregate_type', length: 255 })
  aggregateType!: string;

  @Property({ fieldName: 'aggregate_id', length: 255 })
  aggregateId!: string;

  @Property({ type: 'json' })
  payload!: Record<string, unknown>;

  @Enum({
    items: () => OutboxEventStatus,
    default: OutboxEventStatus.PENDING,
  })
  status = OutboxEventStatus.PENDING;

  @Property({ fieldName: 'attempt_count', default: 0 })
  attemptCount = 0;

  @Property({ fieldName: 'available_at' })
  availableAt = new Date();

  @Property({ fieldName: 'processed_at', nullable: true })
  processedAt?: Date;

  @Property({ fieldName: 'last_error', type: 'text', nullable: true })
  lastError?: string;
}
