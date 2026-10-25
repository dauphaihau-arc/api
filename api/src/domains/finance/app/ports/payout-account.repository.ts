import type {
  PayoutAccountRequirements,
  PayoutAccountStatus,
} from '../../domain/rules/payout-account';
import type { FinanceRepositoryContext } from './finance-repository-context';

/**
 * A shop's active Payout Account as the application reads it. Only the
 * provider's account id, the capabilities it reports and display-only bank
 * metadata cross this boundary: there is no bank number, routing number or
 * holder name to keep anywhere.
 */
export interface PayoutAccountRecord {
  id: string;
  shopId: string;
  provider: string;
  providerAccountId: string | null;
  country: string;
  currency: string;
  status: PayoutAccountStatus;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  transfersCapability: string | null;
  requirements: PayoutAccountRequirements | null;
  defaultCurrency: string | null;
  bankName: string | null;
  last4: string | null;

  /**
   * When the row was last written. The read path uses it to decide whether an
   * awaiting account is stale enough to re-read from the provider, and to
   * throttle that re-read to one attempt per interval.
   */
  updatedAt: Date;
}

/**
 * A Payout Account as the payout run needs it: the open, usable account the
 * provider must receive as the transfer destination. There is no reference to
 * decrypt: the provider account id is the destination.
 */
export interface PayoutAccountPaymentTarget {
  id: string;
  shopId: string;
  provider: string;
  providerAccountId: string | null;
  country: string;
  currency: string;
}

/** The capabilities and requirements a sync may replace. */
export interface PayoutAccountCapabilitiesInput {
  status: PayoutAccountStatus;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  transfersCapability: string | null;
  requirements: PayoutAccountRequirements | null;
  country: string;
  defaultCurrency: string | null;
}

/** A new open Payout Account row. */
export interface CreatePayoutAccountInput {
  shopId: string;
  provider: string;
  providerAccountId: string | null;
  country: string;
  currency: string;
  status: PayoutAccountStatus;
  payoutsEnabled?: boolean;
  chargesEnabled?: boolean;
  transfersCapability?: string | null;
  requirements?: PayoutAccountRequirements | null;
  defaultCurrency?: string | null;
}

/**
 * A patch to the open row. Only the fields present are written, so an
 * onboarding retry cannot erase capabilities a webhook already recorded.
 */
export interface UpdatePayoutAccountInput extends Partial<PayoutAccountCapabilitiesInput> {
  shopId: string;
  provider?: string;
  providerAccountId?: string | null;
  currency?: string;

  /** The bank's display name from the provider, or null when it has none. */
  bankName?: string | null;

  /** The last four digits of the payout account number, or null. */
  last4?: string | null;
}

export abstract class PayoutAccountRepository {
  /** The shop's open Payout Account, or `null` when it has none. */
  abstract findActiveByShopId(
    shopId: string,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutAccountRecord | null>;

  /**
   * The shop's open Payout Account when it is usable as a destination. An
   * `onboarding`, `action_required`, `restricted` or `disabled` account is not.
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
   * One Payout Account by the provider's account id. A webhook arrives for an
   * account this deployment may not have stored, in which case the caller
   * ignores it rather than inventing a row.
   */
  abstract findByProviderAccountId(
    providerAccountId: string,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutAccountRecord | null>;

  /**
   * Closes the shop's open Payout Account without replacing it, stamping
   * `deactivated_at` so the row becomes historical.
   */
  abstract closeActive(
    shopId: string,
    at: Date,
    context?: FinanceRepositoryContext,
  ): Promise<void>;

  /**
   * Inserts a new Payout Account and closes the shop's previous open row in one
   * transaction, so exactly one row per shop stays active and a Payout that
   * already happened keeps pointing at the row it paid.
   */
  abstract createActive(
    input: CreatePayoutAccountInput,
    context: FinanceRepositoryContext,
  ): Promise<PayoutAccountRecord>;

  /**
   * Updates the shop's open Payout Account. Returns `null` when the shop has no
   * open row — a replacement may have closed it — so the caller never reports a
   * state it did not persist.
   */
  abstract updateActive(
    input: UpdatePayoutAccountInput,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutAccountRecord | null>;

  /**
   * Stamps the open row's `updated_at` without changing any capability. The
   * read-path self-heal records that it just asked the provider, so a polling
   * client throttles on the same timestamp even when the provider reported no
   * change to store.
   */
  abstract touchActive(shopId: string, at: Date): Promise<void>;
}
