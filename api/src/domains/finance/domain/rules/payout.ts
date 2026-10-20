import { PayoutAmountNotPositiveError } from '../errors/finance-domain.error';
import { LedgerAccountKind } from '../enums/ledger-account-kind.enum';
import type { Posting } from '../value-objects/posting';

/**
 * A Payout's lifecycle. A Payout is claimed as `pending` before its provider
 * call, becomes `paid` once the provider accepted the transfer, and is left
 * `blocked` (no usable Payout Account) or `failed` (the provider refused) by the
 * guards that later slices add. Only a `paid` Payout discharges Seller Payable.
 */
export type PayoutState = 'pending' | 'paid' | 'blocked' | 'failed';

/**
 * The unique idempotency identity of a Payout's Journal Entry, so a retried
 * settle cannot discharge the same Seller Payable twice.
 */
export function paidPayoutMoneyEventKey(payoutId: string): string {
  return `payout.paid:${payoutId}`;
}

/**
 * The platform day a Payout Run belongs to, as `YYYY-MM-DD` in UTC. One run
 * decides every shop's day from this single instant, so "once a day" means the
 * same thing for every shop and never depends on a shop's local time.
 */
export function payoutRunDay(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

/** The money facts of the Payout being discharged, already in the shop's Settlement Currency. */
export interface PaidPayoutMoneyFacts {
  shopId: string;
  currency: string;
  amountMinor: number;
}

/**
 * Builds the Postings that discharge a Payout: the shop's Seller Payable is
 * reduced by exactly the amount paid, and the same amount leaves Platform
 * Clearing, so the entry balances to zero in the shop's Settlement Currency.
 *
 * The Payout converts nothing: every amount here is already denominated in the
 * shop's Settlement Currency.
 */
export function buildPaidPayoutPostings(facts: PaidPayoutMoneyFacts): Posting[] {
  if (facts.amountMinor <= 0) {
    throw new PayoutAmountNotPositiveError(facts.amountMinor);
  }

  const currency = facts.currency;

  return [
    {
      account: {
        kind: LedgerAccountKind.SELLER_PAYABLE,
        currency,
        shopId: facts.shopId,
      },
      amountMinor: -facts.amountMinor,
    },
    {
      account: { kind: LedgerAccountKind.PLATFORM_CLEARING, currency },
      amountMinor: facts.amountMinor,
    },
  ];
}
