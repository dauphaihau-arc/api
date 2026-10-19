import {
  Entity,
  Index,
  ManyToOne,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';

/**
 * The dated history of a shop's Settlement Currency: the currency Seller
 * Payable accrued in from `effective_from` until it was closed. Exactly one row
 * per shop is open, and a closed row is never rewritten, so a reversal of an
 * earlier Money Event still resolves the currency that Order settled in.
 *
 * A shop's opening row is seeded from the shop's own currency when its first
 * Money Event is recorded.
 */
@Entity({ tableName: 'settlement_currency_history' })
@Unique({ properties: ['shop', 'effectiveFrom'] })
@Index({ properties: ['shop'] })
export class SettlementCurrencyHistoryEntity extends AbstractBaseEntity {
  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    deleteRule: 'restrict',
  })
  shop!: ShopEntity;

  @Property({ fieldName: 'currency', length: 3 })
  currency!: string;

  @Property({ fieldName: 'effective_from' })
  effectiveFrom!: Date;

  @Property({ fieldName: 'effective_to', nullable: true })
  effectiveTo?: Date;
}
