import { PayoutAccountInvalidError } from '../errors/finance-domain.error';

/**
 * The payout adapter a Payout Account points at. `manual_bank` is the local
 * development adapter that settles out of band; `stripe_connect` is a Stripe
 * Express connected account that receives transfers.
 */
export const MANUAL_BANK_PROVIDER = 'manual_bank';
export const STRIPE_CONNECT_PROVIDER = 'stripe_connect';

/**
 * A Payout Account row's lifecycle.
 *
 * `onboarding` means Stripe has not granted a capability yet; `action_required`
 * means the seller must supply something before payouts can start; `active`
 * means transfers are granted and payouts are enabled; `restricted` means Stripe
 * has disabled a capability; `disabled` closes a destination without replacing
 * it.
 */
export type PayoutAccountStatus =
  | 'onboarding'
  | 'action_required'
  | 'active'
  | 'restricted'
  | 'disabled';

/**
 * The subset of Stripe's requirements that Arc stores. It is a summary, never
 * the identity documents or tax details themselves.
 */
export interface PayoutAccountRequirements {
  currentlyDue: string[];
  disabledReason: string | null;
}

/** What a provider reports about a connected account's capabilities. */
export interface ConnectPayoutAccountState {
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  transfersCapability: string | null;
  requirementsDue: readonly string[];
  disabledReason: string | null;
}

const COUNTRY_PATTERN = /^[A-Z]{2}$/;

/**
 * Refuses a country that is not an ISO 3166-1 alpha-2 code. Whether Stripe
 * supports Connect in that country is the provider's answer, reported when the
 * account is created.
 */
export function assertValidPayoutAccountCountry(country: string): void {
  if (!COUNTRY_PATTERN.test(country.toUpperCase())) {
    throw new PayoutAccountInvalidError(
      'country must be an ISO 3166-1 alpha-2 code',
    );
  }
}

/**
 * Derives the stored status from what Stripe reports.
 *
 * A disabled capability wins over everything else, because the account cannot
 * be used even if its requirements are still listed as due. An account whose
 * transfers capability is active and whose payouts are enabled is `active`.
 * Outstanding requirements mean the seller has something to do, and anything
 * else — no capability granted yet, or a capability still pending — is still
 * onboarding.
 */
export function deriveConnectPayoutAccountStatus(
  state: ConnectPayoutAccountState,
): PayoutAccountStatus {
  if (state.disabledReason) {
    return 'restricted';
  }

  if (state.transfersCapability === 'active' && state.payoutsEnabled) {
    return 'active';
  }

  if (state.requirementsDue.length > 0) {
    return 'action_required';
  }

  return 'onboarding';
}

/** The requirements summary Arc stores, from what the provider reported. */
export function toPayoutAccountRequirements(
  requirementsDue: readonly string[],
  disabledReason: string | null,
): PayoutAccountRequirements {
  return {
    currentlyDue: [...requirementsDue],
    disabledReason,
  };
}
