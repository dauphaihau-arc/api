import { MARKETPLACE_CURRENCIES } from '~/platform/config/marketplace.config';
import { getCurrencyScale } from './currency-precision';

describe('getCurrencyScale', () => {
  it('agrees with CLDR for every accepted marketplace currency', () => {
    for (const currency of MARKETPLACE_CURRENCIES) {
      const cldrScale = new Intl.NumberFormat('en', {
        style: 'currency',
        currency,
      }).resolvedOptions().maximumFractionDigits;

      expect([currency, getCurrencyScale(currency)]).toEqual([currency, cldrScale]);
    }
  });

  it('reports zero decimals for zero-decimal presentment currencies', () => {
    expect(getCurrencyScale('JPY')).toBe(0);
    expect(getCurrencyScale('KRW')).toBe(0);
    expect(getCurrencyScale('VND')).toBe(0);
  });

  it('falls back to CLDR for currencies outside the accepted list', () => {
    expect(getCurrencyScale('CLP')).toBe(0);
    expect(getCurrencyScale('KWD')).toBe(3);
  });
});
