import {
  Entity,
  ManyToOne,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';

/**
 * The immutable record of one Money Event's money consequences. One row per
 * Money Event, identified by its unique money event key.
 *
 * The entry is denominated in the shop's Settlement Currency. When the buyer
 * paid in another currency the entry keeps what was collected — the charge
 * currency, the amount collected in it, and the rate the conversion used — as
 * evidence; a same-currency Order carries none of it.
 */
@Entity({ tableName: 'journal_entries' })
export class JournalEntryEntity extends AbstractBaseEntity {
  @Property({ fieldName: 'money_event_key', length: 255 })
  @Unique()
  moneyEventKey!: string;

  @Property({ fieldName: 'money_event_kind', length: 64 })
  moneyEventKind!: string;

  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    deleteRule: 'restrict',
  })
  shop!: ShopEntity;

  @Property({ fieldName: 'currency', length: 3 })
  currency!: string;

  @Property({ fieldName: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Property({ fieldName: 'charge_currency', length: 3, nullable: true })
  chargeCurrency?: string;

  @Property({ fieldName: 'charge_amount_minor', nullable: true })
  chargeAmountMinor?: number;

  @Property({ fieldName: 'fx_rate', type: 'text', nullable: true })
  fxRate?: string;

  @Property({ fieldName: 'fx_rate_source', length: 100, nullable: true })
  fxRateSource?: string;

  @Property({ fieldName: 'fx_rate_effective_at', nullable: true })
  fxRateEffectiveAt?: Date;

  @Property({ fieldName: 'fx_rate_source_timestamp', nullable: true })
  fxRateSourceTimestamp?: Date;
}
