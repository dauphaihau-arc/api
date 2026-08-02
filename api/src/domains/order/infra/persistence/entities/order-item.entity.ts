import {
  Entity, Index, ManyToOne, Property, 
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { ProductInventoryEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
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

  @Property({ fieldName: 'unit_price_minor' })
  unitPriceMinor!: number;

  @Property({
    fieldName: 'sale_price', type: 'numeric', precision: 12, scale: 2, nullable: true, 
  })
  salePrice?: number;

  @Property({ fieldName: 'original_amount_minor', nullable: true })
  originalAmountMinor?: number;

  @Property()
  quantity!: number;

  @Property({ fieldName: 'line_total_minor' })
  lineTotalMinor!: number;

  @Property({ fieldName: 'currency', length: 3, nullable: true })
  currency?: string;

  @Property({ fieldName: 'source_price_id', nullable: true })
  sourcePriceId?: string;

  @Property({ fieldName: 'source_type', length: 20, nullable: true })
  sourceType?: 'market_override' | 'base_native' | 'base_fx';

  @Property({ fieldName: 'market_code', length: 20, nullable: true })
  marketCode?: string;

  @Property({ fieldName: 'fx_rate', type: 'text', nullable: true })
  fxRate?: string;

  @Property({ fieldName: 'fx_source', length: 100, nullable: true })
  fxSource?: string;

  @Property({ fieldName: 'fx_effective_at', nullable: true })
  fxEffectiveAt?: Date;

  @Property({ fieldName: 'fx_source_timestamp', nullable: true })
  fxSourceTimestamp?: Date;

  @Property({ fieldName: 'percent_coupon_code', length: 12, nullable: true })
  percentCouponCode?: string;

  @Property({ fieldName: 'percent_coupon_percent', nullable: true })
  percentCouponPercent?: number;
}
