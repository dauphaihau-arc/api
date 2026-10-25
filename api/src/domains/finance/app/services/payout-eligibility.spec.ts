import type { PayoutAccountRecord } from '../ports/payout-account.repository';
import {
  resolveAutoPayoutEligibility,
  resolvePayoutAccountBlockReason,
} from './payout-eligibility';

function account(
  overrides: Partial<PayoutAccountRecord> = {},
): PayoutAccountRecord {
  return {
    id: 'account-1',
    shopId: 'shop-1',
    provider: 'manual_bank',
    providerAccountId: null,
    country: 'US',
    currency: 'USD',
    status: 'active',
    payoutsEnabled: true,
    chargesEnabled: true,
    transfersCapability: 'active',
    requirements: null,
    defaultCurrency: 'USD',
    bankName: null,
    last4: null,
    updatedAt: new Date('2026-10-24T10:00:00.000Z'),
    ...overrides,
  };
}

function connected(
  overrides: Partial<PayoutAccountRecord> = {},
): PayoutAccountRecord {
  return account({
    provider: 'stripe_connect',
    providerAccountId: 'acct_1',
    ...overrides,
  });
}

describe('resolvePayoutAccountBlockReason', () => {
  it('accepts an active account whatever its currency', () => {
    expect(resolvePayoutAccountBlockReason(account())).toBeNull();
    // The account currency is Stripe's; it never has to match the shop's
    // Settlement Currency.
    expect(resolvePayoutAccountBlockReason(account({ currency: 'VND' }))).toBeNull();
    expect(
      resolvePayoutAccountBlockReason(connected({ currency: 'EUR' })),
    ).toBeNull();
  });

  it('requires a connected account to report payouts enabled and transfers active', () => {
    expect(resolvePayoutAccountBlockReason(connected())).toBeNull();

    expect(
      resolvePayoutAccountBlockReason(connected({ payoutsEnabled: false })),
    ).toBe('payout_account_unverified');
    expect(
      resolvePayoutAccountBlockReason(connected({ transfersCapability: 'pending' })),
    ).toBe('payout_account_unverified');
    expect(
      resolvePayoutAccountBlockReason(connected({ transfersCapability: null })),
    ).toBe('payout_account_unverified');
  });

  it('does not apply the capability flags to the local manual adapter', () => {
    expect(
      resolvePayoutAccountBlockReason(
        account({
          provider: 'manual_bank',
          payoutsEnabled: false,
          transfersCapability: null,
        }),
      ),
    ).toBeNull();
  });

  it('blocks an account that is still onboarding or needs requirements', () => {
    expect(
      resolvePayoutAccountBlockReason(account({ status: 'onboarding' })),
    ).toBe('payout_account_unverified');
    expect(
      resolvePayoutAccountBlockReason(account({ status: 'action_required' })),
    ).toBe('payout_account_unverified');
  });

  it('blocks a restricted or disabled account', () => {
    expect(
      resolvePayoutAccountBlockReason(account({ status: 'restricted' })),
    ).toBe('payout_account_disabled');
    expect(
      resolvePayoutAccountBlockReason(account({ status: 'disabled' })),
    ).toBe('payout_account_disabled');
  });

  it('blocks an active account whose country is outside the payout allowlist', () => {
    expect(
      resolvePayoutAccountBlockReason(connected({ country: 'AU' })),
    ).toBe('payout_account_country_unsupported');
    expect(
      resolvePayoutAccountBlockReason(account({ country: 'JP' })),
    ).toBe('payout_account_country_unsupported');
  });

  it('accepts an active account in a supported country', () => {
    expect(
      resolvePayoutAccountBlockReason(connected({ country: 'GB' })),
    ).toBeNull();
    expect(
      resolvePayoutAccountBlockReason(connected({ country: ' gb ' })),
    ).toBeNull();
  });

  it('uses the configured allowlist, so a narrowing blocks a country it dropped', () => {
    expect(
      resolvePayoutAccountBlockReason(connected({ country: 'US' }), ['GB']),
    ).toBe('payout_account_country_unsupported');
    expect(
      resolvePayoutAccountBlockReason(connected({ country: 'GB' }), ['GB']),
    ).toBeNull();
  });

  it('blocks a shop with no account', () => {
    expect(resolvePayoutAccountBlockReason(null)).toBe('no_payout_account');
  });
});

describe('resolveAutoPayoutEligibility', () => {
  it('is eligible when capabilities are active, even with a foreign account currency', () => {
    expect(
      resolveAutoPayoutEligibility(connected({ currency: 'VND' }), 'USD'),
    ).toEqual({ eligible: true, reason: null });
  });

  it('keeps blocking an account whose capabilities are not granted', () => {
    expect(
      resolveAutoPayoutEligibility(
        connected({ transfersCapability: 'inactive' }),
        'USD',
      ),
    ).toEqual({ eligible: false, reason: 'payout_account_unverified' });
    expect(
      resolveAutoPayoutEligibility(account({ status: 'action_required' }), 'USD'),
    ).toEqual({ eligible: false, reason: 'payout_account_unverified' });
  });

  it('needs a resolved Settlement Currency for the amount that leaves', () => {
    expect(resolveAutoPayoutEligibility(account(), null)).toEqual({
      eligible: false,
      reason: 'settlement_currency_unresolved',
    });
  });

  it('blocks opting in when the account country is outside the allowlist', () => {
    expect(
      resolveAutoPayoutEligibility(connected({ country: 'AU' }), 'USD'),
    ).toEqual({ eligible: false, reason: 'payout_account_country_unsupported' });
  });
});
