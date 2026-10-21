import type { PayoutAccountRecord } from '../ports/payout-account.repository';

/** Why a shop may not opt in to automatic payouts yet. */
export type AutoPayoutIneligibleReason =
  | 'no_payout_account'
  | 'payout_account_unverified'
  | 'payout_account_disabled'
  | 'payout_account_currency_mismatch'
  | 'settlement_currency_unresolved';

export interface AutoPayoutEligibility {
  eligible: boolean;
  reason: AutoPayoutIneligibleReason | null;
}

/**
 * A shop may opt in to automatic payouts only when the scheduled run could
 * actually pay it: an open, verified Payout Account in the shop's current
 * Settlement Currency. The same reasons the run reports as a Blocked Payout.
 */
export function resolveAutoPayoutEligibility(
  account: PayoutAccountRecord | null,
  settlementCurrency: string | null,
): AutoPayoutEligibility {
  if (!account) {
    return { eligible: false, reason: 'no_payout_account' };
  }

  if (account.status === 'pending') {
    return { eligible: false, reason: 'payout_account_unverified' };
  }

  if (account.status === 'disabled') {
    return { eligible: false, reason: 'payout_account_disabled' };
  }

  if (!account.verifiedAt) {
    return { eligible: false, reason: 'payout_account_unverified' };
  }

  if (!settlementCurrency) {
    return { eligible: false, reason: 'settlement_currency_unresolved' };
  }

  if (account.currency !== settlementCurrency) {
    return { eligible: false, reason: 'payout_account_currency_mismatch' };
  }

  return { eligible: true, reason: null };
}
