import type { LedgerAccount } from './ledger-account';

/**
 * One line of a Journal Entry: an amount moved into or out of one Ledger
 * Account. The amount is positive when it credits the account and negative when
 * it debits it, in integer minor units of the account's currency.
 */
export interface Posting {
  account: LedgerAccount;
  amountMinor: number;
}
