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
 * The single redemption code of a Checkout Discount. A Sale has no code row.
 *
 * Codes are stored normalized to upper case so the unique constraint over
 * `(shop_id, code)` enforces case-insensitive, shop-scoped uniqueness: a code
 * never ambiguously identifies different offers in one shop, and may coincide
 * across shops. `shop_id` is denormalized from the owning Promotion so the
 * database can enforce that uniqueness directly.
 */
@Entity({ tableName: 'promotion_codes' })
@Index({ properties: ['promotion'] })
@Unique({ properties: ['shopId', 'code'] })
export class PromotionCodeEntity extends AbstractBaseEntity {
  @ManyToOne(() => PromotionEntity, {
    fieldName: 'promotion_id',
    deleteRule: 'cascade',
  })
  @Unique()
  promotion!: PromotionEntity;

  @Property({ fieldName: 'shop_id', type: 'uuid' })
  shopId!: string;

  @Property({ length: 32 })
  code!: string;
}
