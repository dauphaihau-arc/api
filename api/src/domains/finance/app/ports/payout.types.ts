import type { PayoutSource, PayoutState } from '../../domain/rules/payout';

/** One shop with Available Seller Payable that no Payout has discharged yet. */
export interface PayableShop {
  shopId: string;
  currency: string;
}

/** One Order's available payable, still undischarged and therefore payable. */
export interface PayableOrderAmount {
  orderId: string;
  amountMinor: number;
}

/** A Payout as the application reads it; the amount is in the shop's Settlement Currency. */
export interface PayoutRecord {
  id: string;
  publicId: string;
  /** Human-facing Payout number (`PAY-YYYYMMDD-NNNNNN`). */
  payoutNumber: string;
  amountMinor: number;
  /** The shop's Settlement Currency, and the currency of every discharged amount. */
  currency: string;
  state: PayoutState;

  /**
   * The currency the transfer was denominated in — the platform's provider
   * balance currency — and the amount in it, frozen at claim time. Null on rows
   * claimed before the platform-currency transfer existed.
   */
  transferCurrency: string | null;
  transferAmountMinor: number | null;

  /**
   * The two currencies the Payout names (shop Settlement Currency in, account
   * currency out), the claim-time rate that converted the shop amount into
   * `transferCurrency`, and the provider's evidence: the rate it applied into
   * the destination currency and the destination amount it derived. The
   * provider's values are authoritative.
   */
  sourceCurrency: string | null;
  targetCurrency: string | null;
  fxRate: string | null;
  targetAmountMinor: number | null;
  fxFeeMinor: number | null;
  providerFxRate: string | null;

  /** Where the Payout came from: a scheduled run or a manual withdrawal. */
  source: PayoutSource;

  /** The platform month the Payout belongs to, as `YYYY-MM`; null on older rows. */
  periodKey: string | null;

  /** Why a blocked or failed Payout ended as it did; null while pending or paid. */
  reason: string | null;

  providerReference: string | null;
  paidAt: Date | null;
  createdAt: Date;
}

/** Who to tell, and what to say, when a Payout reaches a terminal outcome. */
export interface PayoutNotificationFacts {
  payoutId: string;
  payoutPublicId: string;
  payoutNumber: string;
  payoutAmountMinor: number;
  currency: string;
  source: PayoutSource;
  reason: string | null;
  shopId: string;
  shopPublicId: string;
  shopName: string;
  recipientUserId: string | null;
  recipientEmail: string | null;
  recipientDisplayName: string | null;
}
