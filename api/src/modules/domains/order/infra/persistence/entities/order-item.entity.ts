import {
  Entity, Index, ManyToOne, Property 
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/common/database/abstract-base.entity';
import { ProductEntity } from '~/modules/domains/product/infra/persistence/entities/product.entity';
import { ProductInventoryEntity } from '~/modules/domains/product/infra/persistence/entities/product-inventory.entity';
import { OrderEntity } from './order.entity';

@Entity({ tableName: 'order_items' })
@Index({ properties: ['order'] })
export class OrderItemEntity extends AbstractBaseEntity {
  @ManyToOne(() => OrderEntity, {
    fieldName: 'order_id',
    deleteRule: 'cascade',
  })
  order!: OrderEntity;

  @ManyToOne(() => ProductEntity, {
    fieldName: 'product_id',
    deleteRule: 'restrict',
  })
  product!: ProductEntity;

  @ManyToOne(() => ProductInventoryEntity, {
    fieldName: 'inventory_id',
    deleteRule: 'restrict',
  })
  inventory!: ProductInventoryEntity;

  @Property({ type: 'text' })
  title!: string;

  @Property({ fieldName: 'image_url', type: 'text', nullable: true })
  imageUrl?: string;

  @Property({ fieldName: 'variant_group_name', length: 100, nullable: true })
  variantGroupName?: string;

  @Property({ fieldName: 'variant_sub_group_name', length: 100, nullable: true })
  variantSubGroupName?: string;

  @Property({ fieldName: 'variant_name', length: 255, nullable: true })
  variantName?: string;

  @Property({ type: 'numeric', precision: 12, scale: 2 })
  price!: number;

  @Property({
    fieldName: 'sale_price', type: 'numeric', precision: 12, scale: 2, nullable: true, 
  })
  salePrice?: number;

  @Property()
  quantity!: number;

  @Property({ fieldName: 'percent_coupon_code', length: 12, nullable: true })
  percentCouponCode?: string;

  @Property({ fieldName: 'percent_coupon_percent', nullable: true })
  percentCouponPercent?: number;
}
