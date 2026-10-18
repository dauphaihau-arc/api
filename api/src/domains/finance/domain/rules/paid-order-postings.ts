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
}

/**
 * Builds the two Postings of a paid Order: the whole shipping charge passes to
 * the seller, the discount reduces what the seller is owed, and everything
 * credited to Seller Payable is debited from Platform Clearing.
 */
export function buildPaidOrderPostings(facts: PaidOrderMoneyFacts): Posting[] {
  const sellerPayableMinor =
    facts.subtotalMinor - facts.discountMinor + facts.shippingMinor;

  return [
    {
      account: {
        kind: LedgerAccountKind.SELLER_PAYABLE,
        currency: facts.currency,
        shopId: facts.shopId,
      },
      amountMinor: sellerPayableMinor,
    },
    {
      account: {
        kind: LedgerAccountKind.PLATFORM_CLEARING,
        currency: facts.currency,
      },
      amountMinor: -sellerPayableMinor,
    },
  ];
}
