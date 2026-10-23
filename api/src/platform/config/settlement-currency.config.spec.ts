import { buildSettlementCurrencyConfig } from './settlement-currency.config';

function configFrom(values: Record<string, string | undefined>) {
  return {
    get: jest.fn(
      (key: string, fallback?: unknown) => values[key] ?? fallback,
    ),
  };
}

describe('buildSettlementCurrencyConfig', () => {
  it('defaults to a 90-day interval', () => {
    expect(buildSettlementCurrencyConfig(configFrom({}))).toEqual({
      changeIntervalDays: 90,
    });
  });

  it('reads a configured interval', () => {
    expect(
      buildSettlementCurrencyConfig(
        configFrom({ SETTLEMENT_CURRENCY_CHANGE_INTERVAL_DAYS: '1' }),
      ).changeIntervalDays,
    ).toBe(1);
    expect(
      buildSettlementCurrencyConfig(
        configFrom({ SETTLEMENT_CURRENCY_CHANGE_INTERVAL_DAYS: '365' }),
      ).changeIntervalDays,
    ).toBe(365);
  });

  it.each(['0', '-1', 'abc', '1.5', ''])(
    'rejects the invalid interval %p',
    (value) => {
      expect(() =>
        buildSettlementCurrencyConfig(
          configFrom({ SETTLEMENT_CURRENCY_CHANGE_INTERVAL_DAYS: value }),
        ),
      ).toThrow(/SETTLEMENT_CURRENCY_CHANGE_INTERVAL_DAYS/);
    },
  );
});
