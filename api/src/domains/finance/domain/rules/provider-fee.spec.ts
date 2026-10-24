import { LedgerAccountKind } from '../enums/ledger-account-kind.enum';
import { InvalidProviderFeeAmountError } from '../errors/finance-domain.error';
import { buildProviderFeePostings } from './provider-fee';

describe('buildProviderFeePostings', () => {
  it('expenses a positive fee against Platform Clearing', () => {
    expect(buildProviderFeePostings({ currency: 'USD', amountMinor: 250 })).toEqual([
      {
        account: { kind: LedgerAccountKind.PLATFORM_FEE, currency: 'USD' },
        amountMinor: -250,
      },
      {
        account: { kind: LedgerAccountKind.PLATFORM_CLEARING, currency: 'USD' },
        amountMinor: 250,
      },
    ]);
  });

  it('reverses a negative fee with the opposite signs', () => {
    expect(buildProviderFeePostings({ currency: 'USD', amountMinor: -250 })).toEqual([
      {
        account: { kind: LedgerAccountKind.PLATFORM_FEE, currency: 'USD' },
        amountMinor: 250,
      },
      {
        account: { kind: LedgerAccountKind.PLATFORM_CLEARING, currency: 'USD' },
        amountMinor: -250,
      },
    ]);
  });

  it('refuses a zero fee with a named domain error', () => {
    expect(() =>
      buildProviderFeePostings({ currency: 'USD', amountMinor: 0 }),
    ).toThrow(InvalidProviderFeeAmountError);
    expect(() =>
      buildProviderFeePostings({ currency: 'USD', amountMinor: 0 }),
    ).toThrow('zero minor units does not describe money that moved');
  });

  it('refuses a fractional fee with a named domain error', () => {
    expect(() =>
      buildProviderFeePostings({ currency: 'USD', amountMinor: 12.5 }),
    ).toThrow(InvalidProviderFeeAmountError);
  });
});
