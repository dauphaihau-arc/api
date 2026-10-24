import { UnbalancedJournalEntryError } from '../errors/finance-domain.error';
import type { Posting } from './posting';

/**
 * The rate provenance of an Order whose money was converted into the shop's
 * Settlement Currency. One rate covers the whole entry, and it is stored
 * verbatim at full precision so a later refund reverses at the same rate.
 */
export interface JournalEntryFxEvidence {
  rate: string;
  source: string;
  effectiveAt: Date;
  sourceTimestamp?: Date;
}

/**
 * The immutable record of one Money Event's money consequences, identified by
 * the Money Event that caused it. Its Postings move money between Ledger
 * Accounts and must sum to zero in the entry's currency — the shop's Settlement
 * Currency.
 *
 * When the buyer paid in another currency, the entry keeps what was collected
 * as evidence: the charge currency, the amount collected in it, and the rate the
 * conversion used. A same-currency Order carries none of it.
 */
export interface JournalEntry {
  moneyEventKey: string;
  moneyEventKind: string;
  /**
   * The shop whose money the entry moves; absent for a platform-level entry
   * such as a Provider Fee, which expenses the platform itself.
   */
  shopId?: string;
  currency: string;
  chargeCurrency?: string;
  chargeAmountMinor?: number;
  fx?: JournalEntryFxEvidence;
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
