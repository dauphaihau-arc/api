import {
  MoneyDecimal,
  fromMinorUnitsExact,
  roundToMinorUnitIncrement,
  toMinorUnits,
} from '~/platform/money/money';
import { LedgerAccountKind } from '../enums/ledger-account-kind.enum';
import type { Posting } from '../value-objects/posting';

/**
 * The unique idempotency identity of one Order Refund's Money Event. The refund
 * fact's own id keys the entry, and the Order id is part of the key so a refund
 * history can be read without consulting Ordering's tables.
 */
export function orderRefundMoneyEventKey(orderId: string, refundId: string): string {
  return `order.refund:${orderId}:${refundId}`;
}

/**
 * Converts an amount in minor units using a rate frozen earlier (on a Journal
 * Entry, or recorded as a Cutover Rate). It rounds once at the destination
 * currency's minor-unit edge, exactly as recording a Money Event does, so a
 * reversal never applies a fresh market rate and never re-denominates history.
 */
export function convertMinorUnitsAtRate(
  amountMinor: number,
  fromCurrency: string,
  toCurrency: string,
  rate: string,
): number {
  if (fromCurrency === toCurrency) {
    return amountMinor;
  }

  const convertedMajor = fromMinorUnitsExact(amountMinor, fromCurrency)
    .times(new MoneyDecimal(rate));

  return toMinorUnits(convertedMajor, toCurrency);
}

/**
 * The share of Platform Commission a refund of `refundedMinor` out of
 * `paidMinor` returns: the commission frozen on the original entry times the
 * refunded fraction, rounded half up once. It never exceeds the commission
 * charged, and a zero denominator returns nothing instead of inventing money.
 */
export function computeProRataCommissionReversalMinor(
  commissionMinor: number,
  refundedMinor: number,
  paidMinor: number,
): number {
  if (commissionMinor <= 0 || refundedMinor <= 0 || paidMinor <= 0) {
    return 0;
  }

  const share = roundToMinorUnitIncrement(
    new MoneyDecimal(commissionMinor).times(refundedMinor).div(paidMinor),
  );

  return Math.min(Math.max(share, 0), commissionMinor);
}

export interface OrderRefundPostingFacts {
  shopId: string;
  /** The shop's current Settlement Currency, and the currency of every posting. */
  settlementCurrency: string;
  /** The refunded amount after conversion, in the Settlement Currency. */
  refundedMinor: number;
  /** The Platform Commission returned with it, already pro rata. */
  commissionReversalMinor: number;
}

/**
 * Builds the Postings of an Order Refund in the shop's current Settlement
 * Currency. Platform Clearing returns the converted refund to the buyer,
 * Platform Commission gives back the refunded share of what it charged, and
 * Seller Payable falls by the rest — so a full refund returns the seller's
 * original credit to exactly zero.
 */
export function buildOrderRefundPostings(facts: OrderRefundPostingFacts): Posting[] {
  const currency = facts.settlementCurrency;
  const commissionReversalMinor = Math.min(
    Math.max(facts.commissionReversalMinor, 0),
    facts.refundedMinor,
  );
  const sellerPayableMinor = facts.refundedMinor - commissionReversalMinor;

  return [
    {
      account: {
        kind: LedgerAccountKind.SELLER_PAYABLE,
        currency,
        shopId: facts.shopId,
      },
      amountMinor: sellerPayableMinor === 0 ? 0 : -sellerPayableMinor,
    },
    ...(commissionReversalMinor === 0
      ? []
      : [{
        account: {
          kind: LedgerAccountKind.PLATFORM_COMMISSION,
          currency,
        },
        amountMinor: -commissionReversalMinor,
      }]),
    {
      account: {
        kind: LedgerAccountKind.PLATFORM_CLEARING,
        currency,
      },
      amountMinor: facts.refundedMinor,
    },
  ];
}
