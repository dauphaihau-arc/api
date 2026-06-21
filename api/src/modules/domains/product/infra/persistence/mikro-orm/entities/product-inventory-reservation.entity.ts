import {
  Entity, Index, ManyToOne, Property, 
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/common/database/abstract-base.entity';
import { ProductInventoryEntity } from './product-inventory.entity';

@Entity({ tableName: 'product_inventory_reservations' })
@Index({ properties: ['productInventory'] })
@Index({ properties: ['orderId'] })
@Index({ properties: ['releasedAt'] })
export class ProductInventoryReservationEntity extends AbstractBaseEntity {
  @ManyToOne(() => ProductInventoryEntity, {
    fieldName: 'product_inventory_id',
    deleteRule: 'cascade',
  })
  productInventory!: ProductInventoryEntity;

  @Property({ fieldName: 'order_id', type: 'uuid' })
  orderId!: string;

  @Property({ fieldName: 'quantity' })
  quantity!: number;

  @Property({ fieldName: 'reserved_at' })
  reservedAt = new Date();

  @Property({ fieldName: 'released_at', nullable: true })
  releasedAt?: Date;
}
