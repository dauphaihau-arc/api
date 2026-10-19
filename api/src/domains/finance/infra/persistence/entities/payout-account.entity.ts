import {
  Entity,
  Index,
  ManyToOne,
  Property,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import type {
  PayoutAccountStatus,
  PayoutAccountType,
} from '../../../domain/rules/payout-account';

/**
 * Where a shop wants to be paid. One open row per shop — enforced by the
 * partial unique index on `shop_id` where `deactivated_at is null` — and a
 * replaced row is closed rather than rewritten, so a Payout that already
 * happened keeps pointing at the account it paid.
 */
@Entity({ tableName: 'payout_accounts' })
@Index({ properties: ['shop', 'deactivatedAt'] })
export class PayoutAccountEntity extends AbstractBaseEntity {
  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    deleteRule: 'restrict',
  })
  shop!: ShopEntity;

  @Property({ fieldName: 'type', length: 16 })
  type!: PayoutAccountType;

  /** The adapter token that would move the money; `manual_bank` for now. */
  @Property({ fieldName: 'provider', length: 32 })
  provider!: string;

  /** AES-256-GCM ciphertext of the seller's reference. Never leaves the API. */
  @Property({ fieldName: 'provider_ref_encrypted', type: 'text' })
  providerRefEncrypted!: string;

  @Property({ fieldName: 'holder_name', length: 255 })
  holderName!: string;

  @Property({ fieldName: 'bank_name', length: 255 })
  bankName!: string;

  /** ISO 3166-1 alpha-2, uppercase. */
  @Property({ fieldName: 'country', length: 2 })
  country!: string;

  /** The Settlement Currency in force when the account was recorded. */
  @Property({ fieldName: 'currency', length: 3 })
  currency!: string;

  /** Last 4 characters of the reference, for display. */
  @Property({ fieldName: 'last4', length: 4 })
  last4!: string;

  @Property({ fieldName: 'status', length: 16 })
  status!: PayoutAccountStatus;

  @Property({ fieldName: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt?: Date;

  @Property({ fieldName: 'deactivated_at', type: 'timestamptz', nullable: true })
  deactivatedAt?: Date;
}
