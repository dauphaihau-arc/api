import { DomainError } from '~/platform/errors/domain.error';

/** Base type for every error the Finance domain raises itself. */
export class FinanceDomainError extends DomainError {}

/**
 * Raised when a Commission Schedule rate cannot describe a commission share:
 * a rate is an integer number of basis points between 0 and 10000 inclusive.
 */
export class InvalidCommissionRateError extends FinanceDomainError {
  constructor(rateBasisPoints: number) {
    super(
      `Commission rate ${rateBasisPoints} basis points is outside the allowed range 0 to 10000`,
    );
  }
}

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
