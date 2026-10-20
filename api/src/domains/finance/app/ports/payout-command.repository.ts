import type { FinanceRepositoryContext } from './finance-repository-context';
import type { PayableOrderAmount } from './payout.types';

/** The Payout row to claim for one shop on one platform day, before the provider is called. */
export interface ClaimPayoutInput {
  publicId: string;
  shopId: string;
  payoutAccountId: string;
  currency: string;
  amountMinor: number;
  runDay: string;
}

/** A claimed Payout, as the run that claimed it reads it back. */
export interface ClaimedPayout {
  id: string;
  publicId: string;
  currency: string;
}

/** The provider outcome that settles a claimed Payout and the Orders it discharged. */
export interface SettlePayoutInput {
  payoutId: string;
  providerReference: string;
  paidAt: Date;
  orders: PayableOrderAmount[];
}

/**
 * Claims a shop's Payout and later records the provider outcome that settles it.
 * Nothing here reads availability or Payout history.
 */
export abstract class PayoutCommandRepository {
  /**
   * Claims the shop's Payout for one platform day, returning the claimed row, or
   * `null` when the shop already has a Payout for that day or still has any
   * Payout `pending`.
   *
   * The pending guard is what keeps an unresolved transfer from being paid
   * again: a run whose provider call has not settled must not be followed by a
   * second claim for the same undischarged Orders, whichever platform day the
   * next run belongs to.
   *
   * Race-safe: concurrent runs claim at most one row for a shop and day.
   */
  abstract claim(
    input: ClaimPayoutInput,
    context: FinanceRepositoryContext,
  ): Promise<ClaimedPayout | null>;

  /**
   * Records the provider's reference on the claimed Payout and the Orders it
   * discharged, returning `true` only when this call moved the Payout from
   * `pending` to `paid`.
   *
   * Race-safe: an already-settled Payout is left as it is rather than written
   * twice, and the caller must not discharge anything when `false` comes back.
   */
  abstract settle(
    input: SettlePayoutInput,
    context: FinanceRepositoryContext,
  ): Promise<boolean>;
}
