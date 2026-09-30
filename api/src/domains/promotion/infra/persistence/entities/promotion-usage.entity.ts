import {
  Entity, Index, ManyToOne, Property, Unique, 
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { PromotionEntity } from './promotion.entity';

/**
 * One consumed Promo Code allowance, written when an Order is successfully
 * committed. One redemption belongs to the applied checkout Promotion and shop
 * Order, never to an individual item or Shipment.
 *
 * `user_id` is a plain identity reference, not a relation: a committed
 * redemption must outlive changes to the buyer account, and it never
 * establishes per-buyer limits by browser identity or unverified email.
 */
@Entity({ tableName: 'promotion_usages' })
@Index({ properties: ['promotion'] })
@Index({ properties: ['userId'] })
@Unique({ properties: ['promotion', 'orderId'] })
export class PromotionUsageEntity extends AbstractBaseEntity {
  @ManyToOne(() => PromotionEntity, {
    fieldName: 'promotion_id',
    deleteRule: 'cascade',
  })
  promotion!: PromotionEntity;

  @Property({ fieldName: 'user_id', type: 'uuid', nullable: true })
  userId?: string | null;

  @Property({ fieldName: 'order_id', type: 'uuid' })
  orderId!: string;

  @Property({ length: 32 })
  code!: string;
}
