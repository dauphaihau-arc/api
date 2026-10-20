import {
  Entity,
  Index,
  ManyToOne,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import type { PayoutState } from '../../../domain/rules/payout';
import { PayoutAccountEntity } from './payout-account.entity';

/**
 * One transfer of a shop's Available Seller Payable into the Payout Account it
 * paid, in the shop's Settlement Currency, with no conversion at payout time.
 *
 * A row is claimed as `pending` before the provider is called, so a second run
 * on the same platform day cannot pay the shop again; the unique index on
 * `(shop_id, run_day)` is what makes that claim hold across worker instances.
 */
@Entity({ tableName: 'payouts' })
@Unique({ properties: ['publicId'] })
@Unique({ properties: ['shop', 'runDay'] })
@Index({ properties: ['shop', 'createdAt'] })
export class PayoutEntity extends AbstractBaseEntity {
  @Property({ fieldName: 'public_id', length: 32 })
  publicId!: string;

  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    deleteRule: 'restrict',
  })
  shop!: ShopEntity;

  /** The Payout Account this Payout paid, kept even after that account is replaced. */
  @ManyToOne(() => PayoutAccountEntity, {
    fieldName: 'payout_account_id',
    deleteRule: 'restrict',
  })
  payoutAccount!: PayoutAccountEntity;

  /** The shop's Settlement Currency, and the currency of every discharged amount. */
  @Property({ fieldName: 'currency', length: 3 })
  currency!: string;

  @Property({ fieldName: 'amount_minor' })
  amountMinor!: number;

  @Property({ fieldName: 'state', length: 16 })
  state!: PayoutState;

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
