import { LedgerAccountKind } from '../enums/ledger-account-kind.enum';
import type { Posting } from '../value-objects/posting';

/**
 * The unique idempotency identity of a paid Order's Money Event. One paid Order
 * produces exactly one Journal Entry under this key.
 */
export function paidOrderMoneyEventKey(orderId: string): string {
  return `order.paid:${orderId}`;
}

export interface PaidOrderMoneyFacts {
  shopId: string;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  /**
   * Platform Commission on the discounted item subtotal, already resolved and
   * frozen by the caller. Absent or zero charges no commission line.
   */
  commissionMinor?: number;
}

/**
 * Builds the Postings of a paid Order: the whole shipping charge passes to the
 * seller, the discount reduces what the seller is owed, Platform Commission is
 * deducted from the discounted item subtotal as platform revenue, and everything
 * the buyer paid is debited from Platform Clearing.
 */
export function buildPaidOrderPostings(facts: PaidOrderMoneyFacts): Posting[] {
  const collectedMinor = facts.subtotalMinor - facts.discountMinor + facts.shippingMinor;
  const commissionMinor = facts.commissionMinor ?? 0;
  const sellerPayableMinor = collectedMinor - commissionMinor;

  return [
    {
      account: {
        kind: LedgerAccountKind.SELLER_PAYABLE,
        currency: facts.currency,
        shopId: facts.shopId,
      },
      amountMinor: sellerPayableMinor,
    },
    ...(commissionMinor === 0
      ? []
      : [{
        account: {
          kind: LedgerAccountKind.PLATFORM_COMMISSION,
          currency: facts.currency,
        },
        amountMinor: commissionMinor,
      }]),
    {
      account: {
        kind: LedgerAccountKind.PLATFORM_CLEARING,
        currency: facts.currency,
      },
      amountMinor: -collectedMinor,
    },
  ];
}
