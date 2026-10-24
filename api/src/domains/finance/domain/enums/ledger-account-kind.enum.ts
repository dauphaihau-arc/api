/**
 * The kinds of Ledger Account a Posting may move into or out of.
 */
export enum LedgerAccountKind {
  PLATFORM_CLEARING = 'platform_clearing',
  PLATFORM_COMMISSION = 'platform_commission',
  PLATFORM_FEE = 'platform_fee',
  SELLER_PAYABLE = 'seller_payable',
}
