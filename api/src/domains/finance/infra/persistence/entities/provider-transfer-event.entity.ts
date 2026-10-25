import {
  Entity,
  Index,
  ManyToOne,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import type { ProviderTransferEventStatus } from '../../../domain/rules/provider-evidence';
import { PayoutEntity } from './payout.entity';

/**
 * The provider's own report of a transfer into a connected account: the
 * evidence a future reconciliation compares against the Payout ledger.
 *
 * Rows are append-only. `provider_event_id` is unique, so a replayed webhook
 * records nothing new, and a transfer that changes state produces another row
 * rather than rewriting this one. `payout_id` is resolved from
 * `payouts.provider_reference` when the Payout is already known; a transfer
 * event that arrives first is kept with a null `payout_id`, because the
 * provider record itself is the evidence and must not be dropped.
 *
 * Nothing here belongs to the ledger: writing a row never posts, settles or
 * reverses anything.
 */
@Entity({ tableName: 'provider_transfer_events' })
@Unique({ properties: ['providerEventId'] })
@Index({ properties: ['transferId'] })
@Index({ properties: ['payout'] })
@Index({ properties: ['occurredAt'] })
export class ProviderTransferEventEntity extends AbstractBaseEntity {
  /** Stripe's `evt_…`, the idempotency key for ingest. */
  @Property({ fieldName: 'provider_event_id', length: 255 })
  providerEventId!: string;

  /** Stripe's `tr_…`, the transfer the platform created for a Payout. */
  @Property({ fieldName: 'transfer_id', length: 255 })
  transferId!: string;

  @ManyToOne(() => PayoutEntity, {
    fieldName: 'payout_id',
    deleteRule: 'restrict',
    nullable: true,
  })
  payout?: PayoutEntity;

  @Property({ fieldName: 'status', length: 16 })
  status!: ProviderTransferEventStatus;

  @Property({ fieldName: 'amount_minor' })
  amountMinor!: number;

  @Property({ fieldName: 'currency', length: 3 })
  currency!: string;

  /** The sum of the transfer's reversals, in transfer-currency minor units. */
  @Property({ fieldName: 'reversed_amount_minor', default: 0 })
  reversedAmountMinor = 0;

  /** The connected account the transfer paid, as the provider reported it. */
  @Property({
    fieldName: 'destination_account_id',
    length: 255,
    nullable: true,
  })
  destinationAccountId?: string | null;

  @Property({ fieldName: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;
}
