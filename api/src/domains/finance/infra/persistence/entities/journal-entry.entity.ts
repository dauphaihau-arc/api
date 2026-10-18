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
}
