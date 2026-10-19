import {
  Entity,
  ManyToOne,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';

/**
 * The record that one Order's Seller Payable became available for payout, and
 * the deliveries that evidenced it. One row per Order, so a replayed delivery
 * is a no-op. The Order is referenced by identity, never by a foreign key.
 */
@Entity({ tableName: 'payout_availabilities' })
export class PayoutAvailabilityEntity extends AbstractBaseEntity {
  @Property({ fieldName: 'order_id', type: 'uuid' })
  @Unique()
  orderId!: string;

  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    deleteRule: 'restrict',
  })
  shop!: ShopEntity;

  @Property({ fieldName: 'currency', length: 3 })
  currency!: string;

  @Property({ fieldName: 'amount_minor' })
  amountMinor!: number;

  @Property({ fieldName: 'delivered_at', type: 'timestamptz' })
  deliveredAt!: Date;

  @Property({ fieldName: 'evidence', type: 'json' })
  evidence!: Record<string, unknown>[];
}
