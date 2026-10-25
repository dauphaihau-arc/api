import type { PayoutProviderBalance } from '~/integrations/payment/app/ports/payout-gateway';

/** Why the provider cannot fund this Payout yet. */
export type ProviderFundingBlock =
  | 'provider_balance_pending'
  | 'provider_balance_insufficient'
  | 'provider_currency_unfunded';

/**
 * Whether the platform's provider balance can fund one transfer, and if not,
 * why.
 *
 * A transfer comes out of the platform's own balance in the transfer currency,
 * not the shop's, so the balance is read before anything is claimed:
 *
 * - no balance entry at all means the platform holds nothing in that currency,
 *   and a transfer in it could not be funded;
 * - enough available funds proceed;
 * - funds the provider is still settling cover the amount, so nothing is wrong
 *   with the Payout itself, only with the timing;
 * - anything else cannot cover the amount, settled or not.
 *
 * None of these are fixed by retrying in minutes, so the caller must not hand
 * them to a bounded retry: a manual withdrawal is refused and a scheduled run
 * skips.
 */
export function resolveProviderFundingBlock(
  balance: PayoutProviderBalance | null,
  transferAmountMinor: number,
): ProviderFundingBlock | null {
  if (!balance) {
    return 'provider_currency_unfunded';
  }

  if (balance.availableMinor >= transferAmountMinor) {
    return null;
  }

  if (balance.availableMinor + balance.pendingMinor >= transferAmountMinor) {
    return 'provider_balance_pending';
  }

  return 'provider_balance_insufficient';
}
