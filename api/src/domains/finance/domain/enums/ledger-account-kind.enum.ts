/**
 * The kinds of Ledger Account a Posting may move into or out of. The set grows
 * as later slices add commission, shipping revenue, refund, and payout accounts.
 */
export enum LedgerAccountKind {
  PLATFORM_CLEARING = 'platform_clearing',
  SELLER_PAYABLE = 'seller_payable',
}
