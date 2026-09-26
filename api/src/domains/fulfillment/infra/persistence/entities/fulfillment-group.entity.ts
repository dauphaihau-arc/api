import {
  Collection,
  Entity,
  Enum,
  Index,
  OneToMany,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { FulfillmentMethod } from '../../../domain/enums/fulfillment-method.enum';
import { FulfillmentOperator } from '../../../domain/enums/fulfillment-operator.enum';
import { FulfillmentProvenance } from '../../../domain/enums/fulfillment-provenance.enum';
import { ShipmentUpdateActorType } from '../../../domain/enums/shipment-update-actor-type.enum';
import { FulfillmentGroupItemEntity } from './fulfillment-group-item.entity';
import { ShipmentEntity } from './shipment.entity';

@Entity({ tableName: 'fulfillment_groups' })
@Unique({ name: 'fulfillment_groups_order_id_unique', properties: ['orderId'] })
@Index({ properties: ['shopId'] })
export class FulfillmentGroupEntity extends AbstractBaseEntity {
  @Property({ fieldName: 'order_id', columnType: 'uuid' })
  orderId!: string;

  @Property({ fieldName: 'shop_id', columnType: 'uuid' })
  shopId!: string;

  @Enum({ items: () => FulfillmentMethod })
  method!: FulfillmentMethod;

  @Enum({ items: () => FulfillmentOperator })
  operator!: FulfillmentOperator;

  @Enum({ items: () => FulfillmentProvenance })
  provenance!: FulfillmentProvenance;

  @Enum({
    items: () => ShipmentUpdateActorType,
    fieldName: 'created_by_actor_type',
    nullable: true,
  })
  createdByActorType?: ShipmentUpdateActorType;

  @Property({ fieldName: 'created_by_actor_id', length: 255, nullable: true })
  createdByActorId?: string;

  @Property({ fieldName: 'created_by_source', length: 255, nullable: true })
  createdBySource?: string;

  @OneToMany(() => FulfillmentGroupItemEntity, (item) => item.group)
  items = new Collection<FulfillmentGroupItemEntity>(this);

  @OneToMany(() => ShipmentEntity, (shipment) => shipment.group)
  shipments = new Collection<ShipmentEntity>(this);
}
