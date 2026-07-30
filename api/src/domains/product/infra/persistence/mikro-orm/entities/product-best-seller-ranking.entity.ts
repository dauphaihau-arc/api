import {
  Entity,
  Index,
  ManyToOne,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ProductEntity } from './product.entity';

@Entity({ tableName: 'product_best_seller_rankings' })
@Index({ properties: ['windowDays', 'rank'] })
@Unique({ properties: ['windowDays', 'rank'] })
@Unique({ properties: ['windowDays', 'product'] })
export class ProductBestSellerRankingEntity extends AbstractBaseEntity {
  @ManyToOne(() => ProductEntity, {
    fieldName: 'product_id',
    deleteRule: 'cascade',
  })
  product!: ProductEntity;

  @Property({ fieldName: 'window_days' })
  windowDays!: number;

  @Property()
  rank!: number;

  @Property({ fieldName: 'order_count' })
  orderCount!: number;

  @Property({ fieldName: 'latest_order_at' })
  latestOrderAt!: Date;
}
