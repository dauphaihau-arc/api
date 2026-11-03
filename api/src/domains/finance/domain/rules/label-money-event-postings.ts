import { LedgerAccountKind } from '../enums/ledger-account-kind.enum';
import type { Posting } from '../value-objects/posting';

/** The unique idempotency identity of a Label Charge. */
export function labelChargeMoneyEventKey(labelId: string): string {
  return `label.charge:${labelId}`;
}

/** The unique idempotency identity of a Label refund's reversal. */
export function labelRefundMoneyEventKey(labelId: string): string {
  return `label.refund:${labelId}`;
}

/**
 * A Label's charge: the seller pays for postage, so Seller Payable is debited
 * and Platform Clearing is credited in the shop's Settlement Currency.
 */
export function buildLabelChargedPostings(input: {
  shopId: string;
  currency: string;
  amountMinor: number;
}): Posting[] {
  return [
    {
      account: {
        kind: LedgerAccountKind.SELLER_PAYABLE,
        currency: input.currency,
        shopId: input.shopId,
      },
      amountMinor: -input.amountMinor,
    },
    {
      account: {
        kind: LedgerAccountKind.PLATFORM_CLEARING,
        currency: input.currency,
      },
      amountMinor: input.amountMinor,
    },
  ];
}

/**
 * A Label refund: the carrier returned the postage, so the charge is reversed
 * posting for posting.
 */
export function buildLabelRefundedPostings(input: {
  shopId: string;
  currency: string;
  amountMinor: number;
}): Posting[] {
  return buildLabelChargedPostings(input).map((posting) => ({
    account: posting.account,
    amountMinor: -posting.amountMinor,
  }));
}
