/**
 * A payout quote: an estimate of what leaves the shop balance and what lands in
 * the account. It is display evidence only — the authoritative rate and
 * destination amount come from the provider's transfer.
 */
export interface PayoutQuote {
  /** The shop's Settlement Currency. */
  sourceCurrency: string;

  /** The Payout Account's currency, as the provider reports it. */
  targetCurrency: string;

  /** The shop-currency amount being paid out. */
  sourceAmountMinor: number;

  /** The rate this estimate was computed at; not authoritative. */
  fxRate: string;

  /** What the provider is expected to transfer, in target-currency minor units. */
  targetAmountMinor: number;

  /** Always `true`: this is an estimate, not a settled amount. */
  estimated: true;
}
