import {
  Entity,
  Index,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import type { ConnectedPayoutStatus } from '../../../domain/rules/provider-evidence';

/**
 * Stripe paying a connected account's bank, as the provider reports it. Arc
 * does not schedule this payout, so the webhook is the only record of it: the
 * evidence a future reconciliation compares against the platform transfer.
 *
 * `provider_payout_id` is unique and the row is upserted, because a payout is
 * one provider fact that can be reported twice (`failed` then `paid`, or a
 * replayed webhook). `provider_account_id` is the provider's connected account
 * id and deliberately has no foreign key: the evidence is stored even when this
 * deployment does not know the account, since reconciliation needs the
 * provider record itself.
 */
@Entity({ tableName: 'connected_payouts' })
@Unique({ properties: ['providerPayoutId'] })
@Index({ properties: ['providerAccountId'] })
@Index({ properties: ['occurredAt'] })
export class ConnectedPayoutEntity extends AbstractBaseEntity {
  /** Stripe's `po_…`. */
  @Property({ fieldName: 'provider_payout_id', length: 255 })
  providerPayoutId!: string;

  /** Stripe's `acct_…`, from `event.account`. */
  @Property({
    fieldName: 'provider_account_id',
    length: 255,
    nullable: true,
  })
  providerAccountId?: string | null;

  @Property({ fieldName: 'status', length: 16 })
  status!: ConnectedPayoutStatus;

  @Property({ fieldName: 'amount_minor' })
  amountMinor!: number;

  @Property({ fieldName: 'currency', length: 3 })
  currency!: string;

  /** The provider's expected arrival day, `YYYY-MM-DD`. */
  @Property({ fieldName: 'arrival_date', type: 'date' })
  arrivalDate!: string;

  /** The provider's failure code, present only on a failed payout. */
  @Property({ fieldName: 'failure_code', length: 255, nullable: true })
  failureCode?: string | null;

  @Property({ fieldName: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;
}
