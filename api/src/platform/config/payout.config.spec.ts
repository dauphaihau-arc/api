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
      retryDelaysMs: [60_000, 300_000, 900_000],
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

  it('reads a shrunken retry schedule', () => {
    expect(
      buildPayoutConfig(
        configFrom({ PAYOUT_RETRY_DELAYS_MS: '1000,2000,3000' }),
      ).retryDelaysMs,
    ).toEqual([1000, 2000, 3000]);
  });

  it('tolerates whitespace around the retry delays', () => {
    expect(
      buildPayoutConfig(
        configFrom({ PAYOUT_RETRY_DELAYS_MS: ' 500 , 600 , 700 ' }),
      ).retryDelaysMs,
    ).toEqual([500, 600, 700]);
  });

  it.each([
    '',
    '1000',
    '1000,2000',
    '1000,2000,3000,4000',
    '1000,2000,abc',
    '1000,2000,0',
    '1000,2000,-1',
    '1000,2000,1.5',
    '1000,,2000',
  ])('rejects the invalid retry schedule %p', (value) => {
    expect(() =>
      buildPayoutConfig(configFrom({ PAYOUT_RETRY_DELAYS_MS: value })),
    ).toThrow(/PAYOUT_RETRY_DELAYS_MS/);
  });

  it('refuses the retry schedule switch in production', () => {
    expect(() =>
      buildPayoutConfig(configFrom({
        NODE_ENV: 'production',
        PAYOUT_RETRY_DELAYS_MS: '1000,2000,3000',
      })),
    ).toThrow(/PAYOUT_RETRY_DELAYS_MS/);

    expect(() =>
      buildPayoutConfig(configFrom({ NODE_ENV: 'production' })),
    ).not.toThrow();
  });
});
