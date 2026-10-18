import {
  Entity,
  Enum,
  ManyToOne,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { LedgerAccountKind } from '../../../domain/enums/ledger-account-kind.enum';

/**
 * A named position that Postings accumulate into: one kind in one currency, and
 * for a shop-owned kind, one row per shop. Identified by its account key string,
 * not by (kind, currency, shop) — the platform accounts carry no shop.
 */
@Entity({ tableName: 'ledger_accounts' })
export class LedgerAccountEntity extends AbstractBaseEntity {
  @Property({ fieldName: 'account_key', length: 160 })
  @Unique()
  accountKey!: string;

  @Enum({ items: () => LedgerAccountKind })
  kind!: LedgerAccountKind;

  @Property({ fieldName: 'currency', length: 3 })
  currency!: string;

  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    nullable: true,
    deleteRule: 'restrict',
  })
  shop?: ShopEntity;
}
