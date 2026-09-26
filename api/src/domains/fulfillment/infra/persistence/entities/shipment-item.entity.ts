import {
  Entity,
  Index,
  ManyToOne,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ShipmentEntity } from './shipment.entity';

@Entity({ tableName: 'shipment_items' })
@Index({ properties: ['shipment'] })
@Unique({ properties: ['shipment', 'orderItemId'] })
export class ShipmentItemEntity extends AbstractBaseEntity {
  @ManyToOne(() => ShipmentEntity, {
    fieldName: 'shipment_id',
    deleteRule: 'cascade',
  })
  shipment!: ShipmentEntity;

  @Property({ fieldName: 'order_item_id', columnType: 'uuid' })
  orderItemId!: string;

  @Property()
  quantity!: number;
}
