import { LedgerAccountKind } from '../enums/ledger-account-kind.enum';
import type { Posting } from '../value-objects/posting';

/**
 * The unique idempotency identity of a paid Order's Money Event. One paid Order
 * produces exactly one Journal Entry under this key.
 */
export function paidOrderMoneyEventKey(orderId: string): string {
  return `order.paid:${orderId}`;
}

/**
 * A paid Order's money facts, already expressed in the shop's Settlement
 * Currency: the caller converts once, at the Money Event, before building the
 * Postings. Keeping the amounts settled means the ledger performs no conversion
 * of its own and the Postings cannot disagree with the rate frozen on the entry.
 */
export interface PaidOrderMoneyFacts {
  shopId: string;

  /** The shop's Settlement Currency, and the currency of every Posting here. */
  settlementCurrency: string;

  /** Discounted item subtotal, in the Settlement Currency. */
  discountedItemSubtotalMinor: number;

  /** The shipping charge, in the Settlement Currency, passed through in full. */
  shippingMinor: number;

  /**
   * Platform Commission on the discounted item subtotal, already resolved and
   * frozen by the caller. Absent or zero charges no commission line.
   */
  commissionMinor?: number;
}

/**
 * Builds the Postings of a paid Order in the shop's Settlement Currency: the
 * whole shipping charge passes to the seller, Platform Commission is deducted
 * from the discounted item subtotal as platform revenue, and everything the
 * buyer paid is debited from Platform Clearing.
 *
 * The discount is not a Posting of its own: it has already reduced the
 * discounted item subtotal this function is given.
 */
export function buildPaidOrderPostings(facts: PaidOrderMoneyFacts): Posting[] {
  const collectedMinor = facts.discountedItemSubtotalMinor + facts.shippingMinor;
  const commissionMinor = facts.commissionMinor ?? 0;
  const sellerPayableMinor = collectedMinor - commissionMinor;
  const currency = facts.settlementCurrency;

  return [
    {
      account: {
        kind: LedgerAccountKind.SELLER_PAYABLE,
        currency,
        shopId: facts.shopId,
      },
      amountMinor: sellerPayableMinor,
    },
    ...(commissionMinor === 0
      ? []
      : [{
        account: {
          kind: LedgerAccountKind.PLATFORM_COMMISSION,
          currency,
        },
        amountMinor: commissionMinor,
      }]),
    {
      account: {
        kind: LedgerAccountKind.PLATFORM_CLEARING,
        currency,
      },
      amountMinor: -collectedMinor,
    },
  ];
}
