import type {
  ConnectedPayoutStatus,
  ProviderTransferEventStatus,
} from '../../domain/rules/provider-evidence';
import type { FinanceRepositoryContext } from './finance-repository-context';

export interface InsertProviderTransferEventInput {
  /** Stripe's event id, the ingest idempotency key. */
  providerEventId: string;
  /** Stripe's transfer id, matched to `payouts.provider_reference`. */
  transferId: string;
  /** The Payout already known for this transfer, when there is one. */
  payoutId: string | null;
  status: ProviderTransferEventStatus;
  amountMinor: number;
  currency: string;
  reversedAmountMinor: number;
  destinationAccountId: string | null;
  occurredAt: Date;
}

export interface UpsertConnectedPayoutInput {
  providerPayoutId: string;
  providerAccountId: string | null;
  status: ConnectedPayoutStatus;
  amountMinor: number;
  currency: string;
  /** `YYYY-MM-DD`. */
  arrivalDate: string;
  failureCode: string | null;
  occurredAt: Date;
}

/**
 * Stores the provider's transfer and connected-payout webhook reports as
 * evidence for reconciliation. Every method is idempotent: the provider retries
 * webhooks, and a duplicate report must not add a row or change an outcome.
 */
export abstract class ProviderEvidenceRepository {
  /**
   * Finds the Payout a provider transfer discharged. `payouts.provider_reference`
   * is the only link the provider gives back, so it is the lookup key.
   */
  abstract findPayoutIdByProviderReference(
    providerReference: string,
    context?: FinanceRepositoryContext,
  ): Promise<string | null>;

  /**
   * Appends one transfer event unless its provider event id is already stored.
   * Returns true when this call inserted the row, false on a replay.
   */
  abstract insertTransferEventIfAbsent(
    input: InsertProviderTransferEventInput,
    context?: FinanceRepositoryContext,
  ): Promise<boolean>;

  /**
   * Inserts the connected payout, or updates the one row already stored for its
   * provider id. A payout can be reported twice (`failed` then `paid`), and the
   * later report is the current truth. Returns true when the row was inserted.
   */
  abstract upsertConnectedPayout(
    input: UpsertConnectedPayoutInput,
    context?: FinanceRepositoryContext,
  ): Promise<boolean>;
}
