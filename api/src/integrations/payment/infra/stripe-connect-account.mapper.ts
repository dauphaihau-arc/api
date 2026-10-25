import type Stripe from 'stripe';
import type {
  ConnectAccountDetails,
  ConnectExternalAccount,
} from '../app/ports/connect-gateway';

/**
 * Projects a Stripe account onto the shape Arc stores. Both the Connect gateway
 * and the webhook mapper use it so a `account.updated` event and an explicit
 * retrieve cannot report the destination differently.
 */
export function toConnectAccountDetails(
  account: Stripe.Account,
): ConnectAccountDetails {
  return {
    id: account.id,
    country: account.country ?? null,
    defaultCurrency: account.default_currency?.toUpperCase() ?? null,
    payoutsEnabled: account.payouts_enabled ?? false,
    chargesEnabled: account.charges_enabled ?? false,
    transfersCapability: account.capabilities?.transfers ?? null,
    requirementsDue: account.requirements?.currently_due ?? [],
    disabledReason: account.requirements?.disabled_reason ?? null,
    externalAccount: toExternalAccount(account),
  };
}

/**
 * Picks the bank account Stripe pays into: the default for its currency when
 * one is marked, otherwise the first bank account. Cards are ignored because
 * they are not a payout destination. Only display metadata is copied; the
 * account number and routing number stay in Stripe.
 */
function toExternalAccount(
  account: Stripe.Account,
): ConnectExternalAccount | null {
  const banks = (account.external_accounts?.data ?? []).filter(
    (external): external is Stripe.BankAccount =>
      external.object === 'bank_account',
  );
  const bank = banks.find((candidate) => candidate.default_for_currency) ??
    banks[0];

  if (!bank) {
    return null;
  }

  return {
    bankName: bank.bank_name?.trim() || null,
    last4: bank.last4,
    currency: bank.currency?.toUpperCase() ?? null,
    country: bank.country?.toUpperCase() ?? null,
    defaultForCurrency: bank.default_for_currency ?? false,
  };
}
