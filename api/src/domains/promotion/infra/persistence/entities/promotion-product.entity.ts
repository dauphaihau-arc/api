import {
  Entity,
  Index,
  ManyToOne,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { PromotionEntity } from './promotion.entity';

/**
 * One explicitly selected Product of a Promotion's Product Scope. Targeting is
 * explicit and normalized instead of a polymorphic array, so target ownership
 * is queryable and unique per Promotion.
 *
 * A target references the Product, not a Product Variant: every purchasable
 * Product Variant under the Product is eligible, including ones created later.
 */
@Entity({ tableName: 'promotion_products' })
@Index({ properties: ['promotion'] })
@Index({ properties: ['productId'] })
@Unique({ properties: ['promotion', 'productId'] })
export class PromotionProductEntity extends AbstractBaseEntity {
  @ManyToOne(() => PromotionEntity, {
    fieldName: 'promotion_id',
    deleteRule: 'cascade',
  })
  promotion!: PromotionEntity;

  @Property({ fieldName: 'product_id', type: 'uuid' })
  productId!: string;
}
