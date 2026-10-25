import { PayoutAccountInvalidError } from '../errors/finance-domain.error';
import {
  assertValidPayoutAccountCountry,
  deriveConnectPayoutAccountStatus,
  toPayoutAccountRequirements,
  type ConnectPayoutAccountState,
} from './payout-account';

function accountState(
  overrides: Partial<ConnectPayoutAccountState> = {},
): ConnectPayoutAccountState {
  return {
    payoutsEnabled: true,
    chargesEnabled: true,
    transfersCapability: 'active',
    requirementsDue: [],
    disabledReason: null,
    ...overrides,
  };
}

describe('assertValidPayoutAccountCountry', () => {
  it('accepts an ISO 3166-1 alpha-2 country in either case', () => {
    expect(() => assertValidPayoutAccountCountry('US')).not.toThrow();
    expect(() => assertValidPayoutAccountCountry('vn')).not.toThrow();
  });

  it('refuses anything that is not two letters', () => {
    expect(() => assertValidPayoutAccountCountry('USA'))
      .toThrow(PayoutAccountInvalidError);
    expect(() => assertValidPayoutAccountCountry('1A'))
      .toThrow(PayoutAccountInvalidError);
    expect(() => assertValidPayoutAccountCountry(''))
      .toThrow(PayoutAccountInvalidError);
  });
});

describe('deriveConnectPayoutAccountStatus', () => {
  it('is active when transfers are active and payouts are enabled', () => {
    expect(deriveConnectPayoutAccountStatus(accountState())).toBe('active');
  });

  it('is onboarding before any capability is granted', () => {
    expect(deriveConnectPayoutAccountStatus(accountState({
      payoutsEnabled: false,
      chargesEnabled: false,
      transfersCapability: null,
    }))).toBe('onboarding');

    expect(deriveConnectPayoutAccountStatus(accountState({
      payoutsEnabled: false,
      transfersCapability: 'pending',
    }))).toBe('onboarding');
  });

  it('is action_required when requirements are due', () => {
    expect(deriveConnectPayoutAccountStatus(accountState({
      payoutsEnabled: false,
      transfersCapability: 'pending',
      requirementsDue: ['external_account'],
    }))).toBe('action_required');
  });

  it('stays active while requirements are due if transfers and payouts are granted', () => {
    expect(deriveConnectPayoutAccountStatus(accountState({
      requirementsDue: ['business_profile.url'],
    }))).toBe('active');
  });

  it('is restricted whenever Stripe reports a disabled reason', () => {
    expect(deriveConnectPayoutAccountStatus(accountState({
      payoutsEnabled: false,
      transfersCapability: 'inactive',
      requirementsDue: ['external_account'],
      disabledReason: 'requirements.past_due',
    }))).toBe('restricted');

    // A disabled reason wins even if the capability still reads active.
    expect(deriveConnectPayoutAccountStatus(accountState({
      disabledReason: 'rejected.fraud',
    }))).toBe('restricted');
  });

  it('is onboarding when payouts are disabled without a requirement or reason', () => {
    expect(deriveConnectPayoutAccountStatus(accountState({
      payoutsEnabled: false,
    }))).toBe('onboarding');
  });
});

describe('toPayoutAccountRequirements', () => {
  it('copies the due field names and the disabled reason', () => {
    expect(toPayoutAccountRequirements(['external_account'], null)).toEqual({
      currentlyDue: ['external_account'],
      disabledReason: null,
    });
  });

  it('does not keep a reference to the provider array', () => {
    const due = ['external_account'];
    const requirements = toPayoutAccountRequirements(due, null);
    due.push('business_profile.url');

    expect(requirements.currentlyDue).toEqual(['external_account']);
  });
});
