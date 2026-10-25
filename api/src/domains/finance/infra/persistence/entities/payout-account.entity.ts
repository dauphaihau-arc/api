import {
  Entity,
  Index,
  ManyToOne,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import type {
  PayoutAccountRequirements,
  PayoutAccountStatus,
} from '../../../domain/rules/payout-account';

/**
 * Where a shop is paid. The row points at a payment provider's connected
 * account and mirrors the capabilities that provider reports; it never stores a
 * bank number, a holder name or identity documents. One open row per shop —
 * enforced by the partial unique index on `shop_id` where `deactivated_at is
 * null` — and a replaced row is closed rather than rewritten, so a Payout that
 * already happened keeps pointing at the account it paid.
 */
@Entity({ tableName: 'payout_accounts' })
@Index({ properties: ['shop', 'deactivatedAt'] })
@Unique({ properties: ['providerAccountId'] })
export class PayoutAccountEntity extends AbstractBaseEntity {
  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    deleteRule: 'restrict',
  })
  shop!: ShopEntity;

  /** The adapter token that moves the money: `manual_bank` or `stripe_connect`. */
  @Property({ fieldName: 'provider', length: 32 })
  provider!: string;

  /**
   * The provider's own id for the destination (`acct_…` for Stripe Connect).
   * Null for the local `manual_bank` adapter, which has no upstream account.
   */
  @Property({ fieldName: 'provider_account_id', length: 255, nullable: true })
  providerAccountId?: string | null;

  /** ISO 3166-1 alpha-2, uppercase. */
  @Property({ fieldName: 'country', length: 2 })
  country!: string;

  /** The Payout Currency this destination is paid in. */
  @Property({ fieldName: 'currency', length: 3 })
  currency!: string;

  @Property({ fieldName: 'status', length: 16 })
  status!: PayoutAccountStatus;

  /** Whether the provider reports it can pay this account. */
  @Property({ fieldName: 'payouts_enabled', type: 'boolean', default: false })
  payoutsEnabled: boolean = false;

  /** Whether the provider reports it can charge on this account's behalf. */
  @Property({ fieldName: 'charges_enabled', type: 'boolean', default: false })
  chargesEnabled: boolean = false;

  /** The provider's transfers capability: `active`, `pending`, `inactive`… */
  @Property({ fieldName: 'transfers_capability', length: 32, nullable: true })
  transfersCapability?: string | null;

  /** A summary of the requirements still due, never the documents themselves. */
  @Property({ fieldName: 'requirements', type: 'jsonb', nullable: true })
  requirements?: PayoutAccountRequirements | null;

  /** The provider's default currency for the account, when it reports one. */
  @Property({ fieldName: 'default_currency', length: 3, nullable: true })
  defaultCurrency?: string | null;

  /**
   * The bank's display name as the provider reports it, e.g. `Chase`. Display
   * metadata only; the full account and routing numbers never reach Arc.
   */
  @Property({ fieldName: 'bank_name', length: 255, nullable: true })
  bankName?: string | null;

  /** The last four digits of the payout account number. */
  @Property({ fieldName: 'last4', length: 4, nullable: true })
  last4?: string | null;

  @Property({ fieldName: 'deactivated_at', type: 'timestamptz', nullable: true })
  deactivatedAt?: Date;
}
