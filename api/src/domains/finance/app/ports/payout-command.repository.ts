import type { FinanceRepositoryContext } from './finance-repository-context';
import type { PayoutSource } from '../../domain/rules/payout';
import type { PayableOrderAmount } from './payout.types';

/** The Payout row to claim for one shop on one platform month, before the provider is called. */
export interface ClaimPayoutInput {
  publicId: string;
  shopId: string;
  payoutAccountId: string;
  currency: string;
  amountMinor: number;
  runDay: string;

  /** Whether an automatic run or a seller's manual withdrawal claimed it. */
  source: PayoutSource;

  /** The platform month the Payout belongs to, as `YYYY-MM`; null for backfilled rows. */
  periodKey: string | null;

  /** The seller who asked for a manual withdrawal, when there is one. */
  requestedByUserId?: string;

  /** Whether the claim uses up its source's monthly allowance. */
  quotaConsumed: boolean;
}

/** A claimed Payout, as the run that claimed it reads it back. */
export interface ClaimedPayout {
  id: string;
  publicId: string;
  currency: string;
}

/** Why a claim wrote nothing: the shop's state, not a transient database error. */
export type PayoutClaimRejection = 'pending' | 'period_claimed' | 'not_claimable';

/**
 * The outcome of a claim: either the claimed Payout, or the reason no row was
 * claimed. A rejection is a decision, so the caller need not re-read the table.
 */
export type ClaimPayoutResult =
  | { payout: ClaimedPayout }
  | { payout: null; rejection: PayoutClaimRejection };

/** The Blocked Payout to record for one shop on one platform month. */
export interface BlockedPayoutInput {
  publicId: string;
  shopId: string;
  currency: string;
  amountMinor: number;
  reason: string;
  runDay: string;
  source: PayoutSource;
  periodKey: string | null;
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
   * Claims the shop's Payout for one platform month, returning the claimed row,
   * or the reason no row was claimed: the shop still has a Payout `pending`, it
   * already used this source's monthly allowance, or there was nothing claimable.
   *
   * The pending guard is what keeps an unresolved transfer from being paid
   * again: a run whose provider call has not settled must not be followed by a
   * second claim for the same undischarged Orders.
   *
   * Race-safe: concurrent claims honour the partial unique indexes per source
   * and period, so one shop is paid at most once per source per month.
   */
  abstract claim(
    input: ClaimPayoutInput,
    context: FinanceRepositoryContext,
  ): Promise<ClaimPayoutResult>;

  /**
   * Records that the shop's scheduled run was Blocked because it has no usable
   * Payout Account, returning `true` only when this call recorded the fact. No
   * provider transfer is made and Seller Payable is never touched.
   *
   * Returns `false` when the shop already has a Payout for the period or a
   * Payout still `pending`, so a blocked month is recorded once.
   */
  abstract recordBlocked(
    input: BlockedPayoutInput,
    context: FinanceRepositoryContext,
  ): Promise<boolean>;

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

  /**
   * Gives a Payout's monthly allowance back without deleting the row, so a
   * transfer that never moved money does not keep the shop from trying again.
   */
  abstract releaseQuota(
    payoutId: string,
    context: FinanceRepositoryContext,
  ): Promise<boolean>;
}
