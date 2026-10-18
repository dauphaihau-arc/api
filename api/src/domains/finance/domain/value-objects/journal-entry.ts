import { UnbalancedJournalEntryError } from '../errors/finance-domain.error';
import type { Posting } from './posting';

/**
 * The immutable record of one Money Event's money consequences, identified by
 * the Money Event that caused it. Its Postings move money between Ledger
 * Accounts and must sum to zero in the entry's currency.
 */
export interface JournalEntry {
  moneyEventKey: string;
  moneyEventKind: string;
  shopId: string;
  currency: string;
  occurredAt: Date;
  postings: Posting[];
}

/**
 * Enforces the double-entry invariant: a Journal Entry's Postings sum to
 * exactly zero in their currency, so the ledger can never create or destroy
 * money. Throws with the Money Event key and the offending sum when they do not.
 */
export function assertBalancedJournalEntry(entry: JournalEntry): void {
  const sumMinor = entry.postings.reduce(
    (total, posting) => total + posting.amountMinor,
    0,
  );

  if (sumMinor !== 0) {
    throw new UnbalancedJournalEntryError(entry.moneyEventKey, sumMinor);
  }
}
