import { buildPayoutConfig } from './payout.config';

function configFrom(values: Record<string, string | undefined>) {
  return {
    get: jest.fn(
      (key: string, fallback?: unknown) => values[key] ?? fallback,
    ),
  };
}

describe('buildPayoutConfig', () => {
  it('defaults to the 15th with manual withdrawals limited', () => {
    expect(buildPayoutConfig(configFrom({}))).toEqual({
      autoPayoutDayOfMonth: 15,
      manualWithdrawalUnlimited: false,
      autoPayoutForceDue: false,
    });
  });

  it('reads a valid auto payout day', () => {
    expect(
      buildPayoutConfig(configFrom({ PAYOUT_AUTO_DAY_OF_MONTH: '1' }))
        .autoPayoutDayOfMonth,
    ).toBe(1);
    expect(
      buildPayoutConfig(configFrom({ PAYOUT_AUTO_DAY_OF_MONTH: '28' }))
        .autoPayoutDayOfMonth,
    ).toBe(28);
  });

  it.each(['0', '29', '31', '-1', 'abc', '15.5', ''])(
    'rejects the out-of-range auto payout day %p',
    (value) => {
      expect(() =>
        buildPayoutConfig(configFrom({ PAYOUT_AUTO_DAY_OF_MONTH: value })),
      ).toThrow(/PAYOUT_AUTO_DAY_OF_MONTH/);
    },
  );

  it.each(['true', 'TRUE', '1', ' 1 '])(
    'accepts %p as the unlimited manual withdrawal flag',
    (value) => {
      expect(
        buildPayoutConfig(
          configFrom({ PAYOUT_MANUAL_WITHDRAWAL_UNLIMITED: value }),
        ).manualWithdrawalUnlimited,
      ).toBe(true);
    },
  );

  it.each(['false', '0', 'yes', ''])(
    'treats %p as the default limited manual withdrawal',
    (value) => {
      expect(
        buildPayoutConfig(
          configFrom({ PAYOUT_MANUAL_WITHDRAWAL_UNLIMITED: value }),
        ).manualWithdrawalUnlimited,
      ).toBe(false);
    },
  );

  it.each(['true', 'TRUE', '1', ' 1 '])(
    'accepts %p as the forced auto payout flag',
    (value) => {
      expect(
        buildPayoutConfig(configFrom({ PAYOUT_AUTO_PAYOUT_FORCE: value }))
          .autoPayoutForceDue,
      ).toBe(true);
    },
  );

  it.each(['false', '0', 'yes', ''])(
    'treats %p as the default non-forced auto payout',
    (value) => {
      expect(
        buildPayoutConfig(configFrom({ PAYOUT_AUTO_PAYOUT_FORCE: value }))
          .autoPayoutForceDue,
      ).toBe(false);
    },
  );

  it('refuses the forced auto payout flag in production', () => {
    expect(() =>
      buildPayoutConfig(configFrom({
        NODE_ENV: 'production',
        PAYOUT_AUTO_PAYOUT_FORCE: 'true',
      })),
    ).toThrow(/PAYOUT_AUTO_PAYOUT_FORCE/);

    expect(() =>
      buildPayoutConfig(configFrom({
        NODE_ENV: 'production',
        PAYOUT_AUTO_PAYOUT_FORCE: 'false',
      })),
    ).not.toThrow();
  });
});
