import {
  Entity,
  Enum,
  Index,
  ManyToOne,
  Property,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ShipmentStatus } from '../../../domain/enums/shipment-status.enum';
import { ShipmentUpdateActorType } from '../../../domain/enums/shipment-update-actor-type.enum';
import { ShipmentUpdateSource } from '../../../domain/enums/shipment-update-source.enum';
import { ShipmentEntity } from './shipment.entity';

@Entity({ tableName: 'shipment_updates' })
@Index({ properties: ['shipment', 'occurredAt'] })
export class ShipmentUpdateEntity extends AbstractBaseEntity {
  @ManyToOne(() => ShipmentEntity, {
    fieldName: 'shipment_id',
    deleteRule: 'cascade',
  })
  shipment!: ShipmentEntity;

  @Enum({ items: () => ShipmentStatus })
  status!: ShipmentStatus;

  @Enum({ items: () => ShipmentUpdateActorType, fieldName: 'actor_type' })
  actorType!: ShipmentUpdateActorType;

  @Property({ fieldName: 'actor_id', length: 255, nullable: true })
  actorId?: string;

  @Enum({ items: () => ShipmentUpdateSource })
  source!: ShipmentUpdateSource;

  @Property({ fieldName: 'occurred_at' })
  occurredAt = new Date();

  @Property({ type: 'text', nullable: true })
  note?: string;

  @Property({ type: 'json', nullable: true })
  payload?: Record<string, unknown>;
}
