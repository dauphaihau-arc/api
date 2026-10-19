import type { JournalEntry } from '../../domain/value-objects/journal-entry';
import type { FinanceRepositoryContext } from './finance-repository-context';

export abstract class JournalEntryRepository {
  /**
   * Records one Journal Entry and its Postings.
   *
   * Returns `true` when this call recorded the entry, and `false` when an entry
   * for the same `moneyEventKey` already existed (a replay). The append is
   * race-safe: concurrent calls for one key must not both record, and a lost
   * race must not abort the surrounding transaction.
   */
  abstract append(
    entry: JournalEntry,
    context: FinanceRepositoryContext,
  ): Promise<boolean>;

  /**
   * Resolves the Seller Payable a Money Event credited, or `null` when the
   * event produced no Seller Payable Posting. Identifies the shop and currency
   * whose position later becomes available.
   */
  abstract findSellerPayableByMoneyEventKey(
    moneyEventKey: string,
    context?: FinanceRepositoryContext,
  ): Promise<{ shopId: string; currency: string; amountMinor: number } | null>;
}
