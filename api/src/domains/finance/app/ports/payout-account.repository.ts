import type { PayoutAccountStatus } from '../../domain/rules/payout-account';
import type { FinanceRepositoryContext } from './finance-repository-context';

/**
 * A shop's active Payout Account as the application reads it. The reference and
 * its ciphertext stay in persistence: `last4` is the only trace of the reference
 * that crosses this boundary.
 */
export interface PayoutAccountRecord {
  id: string;
  shopId: string;
  provider: string;
  holderName: string;
  bankName: string;
  country: string;
  currency: string;
  last4: string;
  status: PayoutAccountStatus;
  verifiedAt: Date | null;
}

/**
 * A Payout Account as the payout run needs it: the open, verified account plus
 * the reference the provider must receive. The reference is encrypted here and
 * decrypted only at the port that moves the money, so no read surface and no
 * audit entry ever carries it.
 */
export interface PayoutAccountPaymentTarget {
  id: string;
  shopId: string;
  provider: string;
  holderName: string;
  bankName: string;
  country: string;
  currency: string;
  last4: string;
  providerRefEncrypted: string;
}

/** The row to activate, already validated, encrypted and normalized. */
export interface ReplacePayoutAccountInput {
  shopId: string;
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
   * The shop's open Payout Account when an operator has verified it, or `null`
   * when the shop has none or its account is still pending or disabled. Only a
   * verified account is a destination a Payout may be sent to.
   */
  abstract findPayableByShopId(
    shopId: string,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutAccountPaymentTarget | null>;

  /**
   * One Payout Account by its id, whichever row a Payout was already claimed
   * against, so a retry keeps sending to the destination it captured instead of
   * one the shop replaced in the meantime.
   */
  abstract findPaymentTargetById(
    payoutAccountId: string,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutAccountPaymentTarget | null>;

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
   * Closes the shop's open Payout Account without replacing it, stamping
   * `deactivated_at` so the row becomes historical. Used by a Settlement
   * Currency change: the old account can no longer receive this shop's money,
   * and the next payout must wait for an account in the new currency.
   */
  abstract closeActive(
    shopId: string,
    at: Date,
    context?: FinanceRepositoryContext,
  ): Promise<void>;

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
