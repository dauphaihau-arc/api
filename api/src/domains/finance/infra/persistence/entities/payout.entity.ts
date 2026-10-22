import {
  Entity,
  Index,
  ManyToOne,
  Opt,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import type { PayoutSource, PayoutState } from '../../../domain/rules/payout';
import { PayoutAccountEntity } from './payout-account.entity';

/**
 * One transfer of a shop's Available Seller Payable into the Payout Account it
 * paid, in the shop's Settlement Currency, with no conversion at payout time.
 *
 * A row is claimed as `pending` before the provider is called, so neither a
 * second run nor a second manual withdrawal can pay the same balance again. The
 * monthly allowance is enforced by partial unique indexes over
 * `(shop_id, period_key)` per `source`, which is why there is no unique key on
 * the run day any more.
 */
@Entity({ tableName: 'payouts' })
@Unique({ properties: ['publicId'] })
@Index({ properties: ['shop', 'createdAt'] })
@Index({ properties: ['shop', 'source', 'periodKey'] })
export class PayoutEntity extends AbstractBaseEntity {
  @Property({ fieldName: 'public_id', length: 32 })
  publicId!: string;

  /** Human-facing number, assigned by the database trigger on insert. */
  @Property({ fieldName: 'payout_number', length: 25 })
  @Unique()
  payoutNumber?: Opt<string>;

  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    deleteRule: 'restrict',
  })
  shop!: ShopEntity;

  /**
   * The Payout Account this Payout paid, kept even after that account is
   * replaced. A Blocked Payout has none: no usable account existed to pay.
   */
  @ManyToOne(() => PayoutAccountEntity, {
    fieldName: 'payout_account_id',
    deleteRule: 'restrict',
    nullable: true,
  })
  payoutAccount?: PayoutAccountEntity;

  /** The shop's Settlement Currency, and the currency of every discharged amount. */
  @Property({ fieldName: 'currency', length: 3 })
  currency!: string;

  @Property({ fieldName: 'amount_minor' })
  amountMinor!: number;

  @Property({ fieldName: 'state', length: 16 })
  state!: PayoutState;

  /** Whether a scheduled run or a seller's manual withdrawal created it. */
  @Property({ fieldName: 'source', length: 16 })
  source: PayoutSource = 'scheduled';

  /**
   * The platform month the Payout belongs to, as `YYYY-MM`. Null on historical
   * rows that predate the monthly allowance.
   */
  @Property({ fieldName: 'period_key', length: 7, nullable: true })
  periodKey?: string;

  /**
   * Whether this row uses up its source's monthly allowance. A Payout released
   * after a failed transfer clears it so the shop can try again.
   */
  @Property({ fieldName: 'quota_consumed', type: 'boolean' })
  quotaConsumed = true;

  /** The seller who asked for a manual withdrawal; null for scheduled Payouts. */
  @ManyToOne(() => UserEntity, {
    fieldName: 'requested_by_user_id',
    deleteRule: 'restrict',
    nullable: true,
  })
  requestedBy?: UserEntity;

  /**
   * Why a blocked or failed Payout ended as it did. A blocked Payout records the
   * missing or unusable account; a failed one records the provider outcome.
   */
  @Property({ fieldName: 'reason', length: 64, nullable: true })
  reason?: string;

  /** The provider's own reference for the transfer, once it accepted it. */
  @Property({ fieldName: 'provider_reference', length: 255, nullable: true })
  providerReference?: string;

  @Property({ fieldName: 'attempt_count', default: 1 })
  attemptCount = 1;

  /** The platform day the run that created this Payout belonged to, as `YYYY-MM-DD`. */
  @Property({ fieldName: 'run_day', type: 'date' })
  runDay!: string;

  @Property({ fieldName: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt?: Date;
}
