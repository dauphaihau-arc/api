import {
  Entity,
  Index,
  ManyToOne,
  Property,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { JournalEntryEntity } from './journal-entry.entity';
import { LedgerAccountEntity } from './ledger-account.entity';

/**
 * One line of a Journal Entry: an amount moved into or out of one Ledger
 * Account, in integer minor units. Positive credits the account, negative
 * debits it.
 */
@Entity({ tableName: 'postings' })
@Index({ properties: ['ledgerAccount'] })
export class PostingEntity extends AbstractBaseEntity {
  @ManyToOne(() => JournalEntryEntity, {
    fieldName: 'journal_entry_id',
    deleteRule: 'restrict',
  })
  journalEntry!: JournalEntryEntity;

  @ManyToOne(() => LedgerAccountEntity, {
    fieldName: 'ledger_account_id',
    deleteRule: 'restrict',
  })
  ledgerAccount!: LedgerAccountEntity;

  @Property({ fieldName: 'amount_minor' })
  amountMinor!: number;
}
