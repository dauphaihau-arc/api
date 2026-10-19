import type {
  PayoutAccountStatus,
  PayoutAccountType,
} from '../../domain/rules/payout-account';
import type { FinanceRepositoryContext } from './finance-repository-context';

/**
 * A shop's active Payout Account as the application reads it. The reference and
 * its ciphertext stay in persistence: `last4` is the only trace of the reference
 * that crosses this boundary.
 */
export interface PayoutAccountRecord {
  id: string;
  shopId: string;
  type: PayoutAccountType;
  provider: string;
  holderName: string;
  bankName: string;
  country: string;
  currency: string;
  last4: string;
  status: PayoutAccountStatus;
  verifiedAt: Date | null;
}

/** The row to activate, already validated, encrypted and normalized. */
export interface ReplacePayoutAccountInput {
  shopId: string;
  type: PayoutAccountType;
  provider: string;
  providerRefEncrypted: string;
  holderName: string;
  bankName: string;
  country: string;
  currency: string;
  last4: string;
}

/** The open row's status to set, and the verification instant to persist. */
export interface UpdatePayoutAccountStatusInput {
  shopId: string;
  status: PayoutAccountStatus;
  verifiedAt: Date | null;
}

export abstract class PayoutAccountRepository {
  /** The shop's open Payout Account, or `null` when it has none. */
  abstract findActiveByShopId(
    shopId: string,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutAccountRecord | null>;

  /**
   * Sets the open Payout Account's status and `verified_at`. Returns `null` when
   * the shop has no open row — a replacement may have closed it — so the caller
   * never reports a status it did not persist.
   */
  abstract updateStatus(
    input: UpdatePayoutAccountStatusInput,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutAccountRecord | null>;

  /**
   * Inserts the new Payout Account and closes the shop's previous open row in
   * one transaction, so exactly one row per shop stays active and a Payout that
   * already happened keeps pointing at the row it paid. Concurrent replacements
   * for one shop serialize rather than racing the partial unique index.
   */
  abstract replaceActive(
    input: ReplacePayoutAccountInput,
    context: FinanceRepositoryContext,
  ): Promise<PayoutAccountRecord>;
}
