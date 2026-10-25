/**
 * The kinds of Ledger Account a Posting may move into or out of.
 */
export enum LedgerAccountKind {
  PLATFORM_CLEARING = 'platform_clearing',
  PLATFORM_COMMISSION = 'platform_commission',
  PLATFORM_FEE = 'platform_fee',
  /**
   * The platform's position in a currency it converted into: the counterpart of
   * Platform Clearing when a Payout leaves the platform balance in a currency
   * other than the shop's. A platform-level account, so it names no shop.
   */
  FX_POSITION = 'fx_position',
  SELLER_PAYABLE = 'seller_payable',
}
