import {
  Entity,
  Enum,
  Index,
  ManyToOne,
  Property,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { OrderRefundStatus } from '../../../domain/enums/order-refund-status.enum';
import { OrderEntity } from './order.entity';

/**
 * One Order Refund fact: the return of an Order's remaining paid money to its
 * buyer, in the currency the buyer actually paid.
 *
 * It records the amount the refund returns (`amountMinor`, the whole remaining
 * amount at request time), the amount the provider actually returned
 * (`refundedAmountMinor`), the provider's own refund id, and the outcome, so
 * Finance can identify a Money Event by this row rather than by a mutable Order
 * column. An Order has at most one refund in flight, and the sum of its
 * succeeded refunds never exceeds what was paid.
 *
 * The row is append-only in the sense that matters to the ledger: a succeeded
 * refund is never deleted or edited, and its identity is the Journal Entry's
 * Money Event key. The Order's `payment_details` refund fields remain a
 * projection of these facts — written in the same transaction, never the
 * authority for how much has already been refunded.
 */
@Entity({ tableName: 'order_refunds' })
@Index({ properties: ['order', 'requestedAt'] })
@Index({ properties: ['providerRefundId'] })
export class OrderRefundEntity extends AbstractBaseEntity {
  @ManyToOne(() => OrderEntity, {
    fieldName: 'order_id',
    deleteRule: 'cascade',
  })
  order!: OrderEntity;

  /** The currency the buyer paid in, and the currency of both amounts below. */
  @Property({ fieldName: 'currency', length: 3 })
  currency!: string;

  /** The remaining amount this refund returns, in minor units. */
  @Property({ fieldName: 'amount_minor' })
  amountMinor!: number;

  /** The amount the provider actually returned, in minor units, once known. */
  @Property({ fieldName: 'refunded_amount_minor', nullable: true })
  refundedAmountMinor?: number;

  @Property({ fieldName: 'provider_refund_id', length: 255, nullable: true })
  providerRefundId?: string;

  @Enum({
    items: () => OrderRefundStatus,
    fieldName: 'status',
  })
  status!: OrderRefundStatus;

  @Property({ fieldName: 'failure_reason', type: 'text', nullable: true })
  failureReason?: string;

  @Property({ fieldName: 'requested_at', type: 'timestamptz' })
  requestedAt!: Date;

  @Property({ fieldName: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date;
}
