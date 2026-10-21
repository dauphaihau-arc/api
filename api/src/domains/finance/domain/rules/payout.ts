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
 * Why a Payout Run did not send a Payout. A Blocked Payout is a recorded fact,
 * not a failure: no transfer was attempted and Seller Payable is unchanged.
 */
export type PayoutBlockReason =
  | 'no_payout_account'
  | 'payout_account_unverified'
  | 'payout_account_disabled'
  | 'payout_account_currency_mismatch';

/**
 * The amount a run may send a shop: only the available part, netted against a
 * negative not-yet-available position so a refund debt is carried rather than
 * paid around.
 *
 * A total that is not positive pays nothing, and a negative available figure
 * pays nothing even when future availability makes the total positive: the debt
 * stays in the available part until later availability offsets it.
 */
export function netPayableMinor(
  availableMinor: number,
  notYetAvailableMinor: number,
): number {
  const totalMinor = availableMinor + notYetAvailableMinor;

  if (availableMinor <= 0 || totalMinor <= 0) {
    return 0;
  }

  return Math.min(availableMinor, totalMinor);
}

/** One Order's undischarged Payout Availability, as the run may pay it. */
export interface AllocatablePayableOrder {
  orderId: string;
  amountMinor: number;
}

/** One Order's share of a Payout, never more than that Order still has available. */
export interface PayoutAllocation {
  orderId: string;
  amountMinor: number;
}

/**
 * Splits a Payout amount across the shop's undischarged Orders, oldest first.
 * An Order may be discharged partially, so a netted amount can be paid exactly
 * and whatever remains stays available for a later run.
 */
export function allocatePayoutOrders(
  orders: readonly AllocatablePayableOrder[],
  amountMinor: number,
): PayoutAllocation[] {
  let remainingMinor = amountMinor;
  const allocations: PayoutAllocation[] = [];

  for (const order of orders) {
    if (remainingMinor <= 0) {
      break;
    }

    const takenMinor = Math.min(order.amountMinor, remainingMinor);

    if (takenMinor <= 0) {
      continue;
    }

    allocations.push({ orderId: order.orderId, amountMinor: takenMinor });
    remainingMinor -= takenMinor;
  }

  return allocations;
}

/**
 * Where a Payout came from: a scheduled automatic run, or a seller's manual
 * withdrawal. The two have separate monthly allowances, so the same shop can use
 * both in one platform month.
 */
export type PayoutSource = 'scheduled' | 'manual';

/**
 * The platform month a Payout belongs to, as `YYYY-MM` in UTC. Used as the
 * once-per-month claim key for both sources.
 */
export function payoutPeriodKey(instant: Date): string {
  return instant.toISOString().slice(0, 7);
}

/**
 * Whether an automatic Payout Run is due on the configured platform day of
 * `instant`. A missed day is not caught up: the next run is due next month.
 */
export function isAutoPayoutDue(
  instant: Date,
  autoPayoutDayOfMonth: number,
): boolean {
  return instant.getUTCDate() === autoPayoutDayOfMonth;
}

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
