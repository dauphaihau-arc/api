/** Base type for every error the Finance domain raises itself. */
export class FinanceDomainError extends Error {}

/**
 * Raised when a Journal Entry's Postings do not sum to zero in their currency.
 * Names the offending Money Event key and the sum that failed the invariant.
 */
export class UnbalancedJournalEntryError extends FinanceDomainError {
  constructor(moneyEventKey: string, sumMinor: number) {
    super(
      `Journal entry ${moneyEventKey} is unbalanced: postings sum to ${sumMinor} minor units instead of 0`,
    );
  }
}
