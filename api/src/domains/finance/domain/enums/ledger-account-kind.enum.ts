/**
 * The kinds of Ledger Account a Posting may move into or out of. The set grows
 * as later slices add shipping revenue, refund, and payout accounts.
 */
export enum LedgerAccountKind {
  PLATFORM_CLEARING = 'platform_clearing',
  PLATFORM_COMMISSION = 'platform_commission',
  SELLER_PAYABLE = 'seller_payable',
}
