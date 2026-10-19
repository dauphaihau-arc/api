import { PayoutAccountInvalidError } from '../errors/finance-domain.error';
import {
  assertValidPayoutAccount,
  assertValidPayoutAccountVerificationStatus,
  maskReference,
  type PayoutAccountInput,
} from './payout-account';

function payoutAccount(
  overrides: Partial<PayoutAccountInput> = {},
): PayoutAccountInput {
  return {
    type: 'bank',
    holderName: 'Jane Seller',
    bankName: 'Example Bank',
    country: 'US',
    accountReference: '0123456789',
    ...overrides,
  };
}

describe('assertValidPayoutAccount', () => {
  it('accepts a bank account and a wallet', () => {
    expect(() => assertValidPayoutAccount(payoutAccount())).not.toThrow();
    expect(() => assertValidPayoutAccount(payoutAccount({ type: 'wallet' }))).not.toThrow();
  });

  it('accepts a country typed in lower case', () => {
    expect(() => assertValidPayoutAccount(payoutAccount({ country: 'vn' }))).not.toThrow();
  });

  it('refuses an unknown type', () => {
    expect(() => assertValidPayoutAccount(payoutAccount({ type: 'cheque' })))
      .toThrow(PayoutAccountInvalidError);
  });

  it('refuses a blank or whitespace-only holder name', () => {
    expect(() => assertValidPayoutAccount(payoutAccount({ holderName: '' })))
      .toThrow(PayoutAccountInvalidError);
    expect(() => assertValidPayoutAccount(payoutAccount({ holderName: '   ' })))
      .toThrow(PayoutAccountInvalidError);
  });

  it('refuses a blank bank name', () => {
    expect(() => assertValidPayoutAccount(payoutAccount({ bankName: '  ' })))
      .toThrow(PayoutAccountInvalidError);
  });

  it('refuses a country that is not two letters', () => {
    expect(() => assertValidPayoutAccount(payoutAccount({ country: 'USA' })))
      .toThrow(PayoutAccountInvalidError);
    expect(() => assertValidPayoutAccount(payoutAccount({ country: '1A' })))
      .toThrow(PayoutAccountInvalidError);
  });

  it('refuses a reference shorter than four characters', () => {
    expect(() => assertValidPayoutAccount(payoutAccount({ accountReference: '123' })))
      .toThrow(PayoutAccountInvalidError);
  });

  it('refuses a reference longer than thirty-four characters', () => {
    expect(() => assertValidPayoutAccount(payoutAccount({ accountReference: '1'.repeat(35) })))
      .toThrow(PayoutAccountInvalidError);
  });

  it('refuses a reference with characters outside letters, digits and dash', () => {
    expect(() => assertValidPayoutAccount(payoutAccount({ accountReference: '0123 4567' })))
      .toThrow(PayoutAccountInvalidError);
    expect(() => assertValidPayoutAccount(payoutAccount({ accountReference: '0123456_' })))
      .toThrow(PayoutAccountInvalidError);
  });
});

describe('maskReference', () => {
  it('keeps the last four characters of the reference', () => {
    expect(maskReference('0123456789')).toEqual({ last4: '6789' });
  });
});

describe('assertValidPayoutAccountVerificationStatus', () => {
  it('accepts active and disabled', () => {
    expect(() => assertValidPayoutAccountVerificationStatus('active')).not.toThrow();
    expect(() => assertValidPayoutAccountVerificationStatus('disabled')).not.toThrow();
  });

  it('refuses any other status, including pending', () => {
    expect(() => assertValidPayoutAccountVerificationStatus('pending'))
      .toThrow(PayoutAccountInvalidError);
    expect(() => assertValidPayoutAccountVerificationStatus('verified'))
      .toThrow(PayoutAccountInvalidError);
  });
});
