import { buildCheckoutConfig, getMaxOrderTotalMinor } from './checkout.config';

describe('buildCheckoutConfig', () => {
  it('builds explicit per-currency defaults', () => {
    const config = buildCheckoutConfig({
      get: jest.fn((_key: string) => undefined),
    });

    expect(getMaxOrderTotalMinor(config, 'USD')).toBe(99999999);
    expect(getMaxOrderTotalMinor(config, 'JPY')).toBe(100000000);
    expect(getMaxOrderTotalMinor(config, 'VND')).toBe(50000000);
  });

  it('overrides only the configured currencies', () => {
    const values: Record<string, string | undefined> = {
      CHECKOUT_MAX_ORDER_TOTALS_BY_CURRENCY: JSON.stringify({
        USD: 1234.56,
        VND: 250000000,
      }),
    };

    const config = buildCheckoutConfig({
      get: jest.fn((key: string) => values[key]),
    });

    expect(getMaxOrderTotalMinor(config, 'USD')).toBe(123456);
    expect(getMaxOrderTotalMinor(config, 'VND')).toBe(250000000);
    expect(getMaxOrderTotalMinor(config, 'JPY')).toBe(100000000);
  });
});
