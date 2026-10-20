import {
  Entity,
  Index,
  ManyToOne,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { PayoutEntity } from './payout.entity';

/**
 * One Order's Available Seller Payable that a Payout discharged, recorded per
 * Order so what a Payout paid is explainable Order by Order rather than as a
 * single lump. The Order is referenced by identity, never by a foreign key.
 *
 * The unique index on `order_id` makes an Order's available payable payable
 * exactly once, whichever run reached it first.
 */
@Entity({ tableName: 'payout_lines' })
@Unique({ properties: ['orderId'] })
@Index({ properties: ['payout'] })
export class PayoutLineEntity extends AbstractBaseEntity {
  @ManyToOne(() => PayoutEntity, {
    fieldName: 'payout_id',
    deleteRule: 'restrict',
  })
  payout!: PayoutEntity;

  @Property({ fieldName: 'order_id', type: 'uuid' })
  orderId!: string;

  @Property({ fieldName: 'amount_minor' })
  amountMinor!: number;
}
