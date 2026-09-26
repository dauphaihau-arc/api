import {
  ArrayType,
  Collection,
  Entity,
  Enum,
  Index,
  ManyToOne,
  OneToMany,
  Property,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ShipmentStatus } from '../../../domain/enums/shipment-status.enum';
import { FulfillmentGroupEntity } from './fulfillment-group.entity';
import { ShipmentItemEntity } from './shipment-item.entity';
import { ShipmentUpdateEntity } from './shipment-update.entity';

@Entity({ tableName: 'shipments' })
@Index({ properties: ['group'] })
@Index({ properties: ['orderId'] })
export class ShipmentEntity extends AbstractBaseEntity {
  @ManyToOne(() => FulfillmentGroupEntity, {
    fieldName: 'group_id',
    deleteRule: 'cascade',
  })
  group!: FulfillmentGroupEntity;

  @Property({ fieldName: 'order_id', columnType: 'uuid' })
  orderId!: string;

  @Property({ fieldName: 'shop_id', columnType: 'uuid' })
  shopId!: string;

  @Enum({ items: () => ShipmentStatus })
  status: ShipmentStatus = ShipmentStatus.PREPARED;

  @Property({ length: 255, nullable: true })
  carrier?: string;

  @Property({ fieldName: 'tracking_number', length: 255, nullable: true })
  trackingNumber?: string;

  @Property({ type: 'text', nullable: true })
  note?: string;

  @Property({
    fieldName: 'origin_countries',
    type: ArrayType,
    defaultRaw: '\'{}\'',
  })
  originCountries: string[] = [];

  @Property({ fieldName: 'prepared_at' })
  preparedAt = new Date();

  @Property({ fieldName: 'dispatched_at', nullable: true })
  dispatchedAt?: Date;

  @Property({ fieldName: 'delivered_at', nullable: true })
  deliveredAt?: Date;

  @Property({ fieldName: 'voided_at', nullable: true })
  voidedAt?: Date;

  @OneToMany(() => ShipmentItemEntity, (item) => item.shipment)
  items = new Collection<ShipmentItemEntity>(this);

  @OneToMany(() => ShipmentUpdateEntity, (update) => update.shipment)
  updates = new Collection<ShipmentUpdateEntity>(this);
}
