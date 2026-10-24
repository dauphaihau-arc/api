import {
  Entity, Index, OneToOne, Property, Unique, 
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { JournalEntryEntity } from './journal-entry.entity';

/**
 * One fee the payment provider charged the platform, recorded from the
 * provider's own record as an expense. The fee is an amount the platform paid,
 * never a deduction from a Seller Payable: its Journal Entry debits Platform
 * Fee and credits Platform Clearing, leaving every shop's position untouched.
 *
 * `(provider, provider_reference)` is unique, so a webhook that reports the
 * same provider charge twice records it once. `journal_entry_id` is unique too:
 * one fee, one Journal Entry.
 */
@Entity({ tableName: 'provider_fees' })
@Unique({ properties: ['provider', 'providerReference'] })
@Unique({ properties: ['journalEntry'] })
export class ProviderFeeEntity extends AbstractBaseEntity {
  @Property({ fieldName: 'provider', length: 32 })
  provider!: string;

  @Property({ fieldName: 'provider_reference', length: 255 })
  providerReference!: string;

  @Property({ fieldName: 'currency', length: 3 })
  currency!: string;

  /**
   * The signed fee in minor units: positive is a fee the provider charged,
   * negative reverses a previously charged fee. Never zero.
   */
  @Property({ fieldName: 'amount_minor' })
  amountMinor!: number;

  @Index({ name: 'provider_fees_occurred_at_index' })
  @Property({ fieldName: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @OneToOne(() => JournalEntryEntity, {
    fieldName: 'journal_entry_id',
    owner: true,
    deleteRule: 'restrict',
  })
  journalEntry!: JournalEntryEntity;

  @Property({ fieldName: 'recorded_at', type: 'timestamptz' })
  recordedAt!: Date;
}
