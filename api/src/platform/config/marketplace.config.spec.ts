import {
  MARKETPLACE_MARKETS,
  validateMarketplaceMarkets,
  type MarketplaceMarket,
} from './marketplace.config';

function market(overrides: Partial<MarketplaceMarket> = {}): MarketplaceMarket {
  return {
    code: 'US',
    name: 'United States',
    defaultCurrency: 'USD',
    supportedCurrencies: ['USD'],
    defaultLocale: 'en-US',
    supportedLocales: ['en-US'],
    enabled: true,
    previewCountryCode: 'US',
    ...overrides,
  };
}

describe('validateMarketplaceMarkets', () => {
  it('accepts the configured United States and Vietnam preview countries', () => {
    expect(() => validateMarketplaceMarkets(MARKETPLACE_MARKETS)).not.toThrow();

    const unitedStates = MARKETPLACE_MARKETS.find((entry) => entry.code === 'US');
    const vietnam = MARKETPLACE_MARKETS.find((entry) => entry.code === 'VN');

    expect(unitedStates?.previewCountryCode).toBe('US');
    expect(vietnam?.previewCountryCode).toBe('VN');
  });

  it('rejects an enabled Market with no preview country', () => {
    expect(() => validateMarketplaceMarkets([
      market({ previewCountryCode: undefined as unknown as string }),
    ])).toThrow(/preview country/i);
  });

  it('rejects an enabled Market with a malformed preview country', () => {
    expect(() => validateMarketplaceMarkets([
      market({ previewCountryCode: 'USA' }),
    ])).toThrow(/preview country/i);
  });

  it('rejects an enabled Market with an unknown preview country', () => {
    expect(() => validateMarketplaceMarkets([
      market({ previewCountryCode: 'ZZ' }),
    ])).toThrow(/preview country/i);
  });

  it('does not validate a disabled Market', () => {
    expect(() => validateMarketplaceMarkets([
      market({ enabled: false, previewCountryCode: '' }),
    ])).not.toThrow();
  });
});
