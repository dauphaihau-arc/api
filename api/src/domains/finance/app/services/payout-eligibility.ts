import type { PayoutAccountRecord } from '../ports/payout-account.repository';
import type { PayoutBlockReason } from '../../domain/rules/payout';
import {
  MANUAL_BANK_PROVIDER,
  STRIPE_CONNECT_PROVIDER,
} from '../../domain/rules/payout-account';
import { DEFAULT_PAYOUT_CONNECT_COUNTRIES } from '~/platform/config/payout-country.config';

/** Why a shop may not opt in to automatic payouts yet. */
export type AutoPayoutIneligibleReason =
  | 'no_payout_account'
  | 'payout_account_unverified'
  | 'payout_account_disabled'
  | 'payout_account_country_unsupported'
  | 'settlement_currency_unresolved';

export interface AutoPayoutEligibility {
  eligible: boolean;
  reason: AutoPayoutIneligibleReason | null;
}

/**
 * The reason a shop cannot be paid into its active account, or `null` when the
 * account can receive this shop's money.
 *
 * Eligibility is decided by the provider's capabilities, never by comparing the
 * account's currency with the shop's Settlement Currency: Stripe converts into
 * the connected account's own currency and reports the applied rate on the
 * transfer, so any destination currency it has granted is payable.
 *
 * A `stripe_connect` account is usable only when the provider reports payouts
 * enabled and the transfers capability active; the stored status is derived the
 * same way, but the two capability flags are checked here so a stale row cannot
 * send money to an account Stripe has since restricted. A `manual_bank` account
 * is usable whenever it is `active`.
 *
 * `supportedCountries` is the onboarding allowlist. An account opened before the
 * allowlist narrowed can still be `active`; Stripe would refuse the transfer
 * after the claim was made, so the country is checked here alongside the
 * capabilities and the account is blocked instead.
 */
export function resolvePayoutAccountBlockReason(
  account: PayoutAccountRecord | null,
  supportedCountries: readonly string[] = DEFAULT_PAYOUT_CONNECT_COUNTRIES,
): PayoutBlockReason | null {
  if (!account) {
    return 'no_payout_account';
  }

  if (!supportedCountries.includes(account.country.trim().toUpperCase())) {
    return 'payout_account_country_unsupported';
  }

  if (account.status === 'onboarding' || account.status === 'action_required') {
    return 'payout_account_unverified';
  }

  if (account.status === 'restricted' || account.status === 'disabled') {
    return 'payout_account_disabled';
  }

  if (
    account.provider === STRIPE_CONNECT_PROVIDER
    && (!account.payoutsEnabled || account.transfersCapability !== 'active')
  ) {
    return 'payout_account_unverified';
  }

  if (
    account.provider !== MANUAL_BANK_PROVIDER
    && account.provider !== STRIPE_CONNECT_PROVIDER
  ) {
    return 'payout_account_disabled';
  }

  return null;
}

/**
 * A shop may opt in to automatic payouts only when the scheduled run could
 * actually pay it: a usable Payout Account, and a resolved Settlement Currency
 * for the amount that leaves the ledger. The same reasons the run reports as a
 * Blocked Payout.
 */
export function resolveAutoPayoutEligibility(
  account: PayoutAccountRecord | null,
  settlementCurrency: string | null,
  supportedCountries: readonly string[] = DEFAULT_PAYOUT_CONNECT_COUNTRIES,
): AutoPayoutEligibility {
  if (!account) {
    return { eligible: false, reason: 'no_payout_account' };
  }

  if (account.status === 'onboarding' || account.status === 'action_required') {
    return { eligible: false, reason: 'payout_account_unverified' };
  }

  if (account.status === 'restricted' || account.status === 'disabled') {
    return { eligible: false, reason: 'payout_account_disabled' };
  }

  if (!settlementCurrency) {
    return { eligible: false, reason: 'settlement_currency_unresolved' };
  }

  const blockReason = resolvePayoutAccountBlockReason(account, supportedCountries);

  if (blockReason) {
    return {
      eligible: false,
      reason: blockReason as AutoPayoutIneligibleReason,
    };
  }

  return { eligible: true, reason: null };
}
