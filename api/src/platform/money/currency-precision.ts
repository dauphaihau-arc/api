import type { MarketplaceCurrency } from '~/platform/config/marketplace.config';

/**
 * ISO 4217 minor-unit exponents for the presentment currencies the marketplace
 * accepts.
 *
 * Declared as a table rather than read from `Intl` at runtime so money rounding
 * cannot change with the host ICU version, and so enabling a currency is an
 * explicit decision. `currency-precision.spec.ts` cross-checks every entry
 * against CLDR.
 */
const CURRENCY_SCALES: Record<MarketplaceCurrency, number> = {
  USD: 2,
  AUD: 2,
  BRL: 2,
  CHF: 2,
  CNY: 2,
  CZK: 2,
  DKK: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  HKD: 2,
  HUF: 2,
  IDR: 2,
  ILS: 2,
  INR: 2,
  JPY: 0,
  KRW: 0,
  MAD: 2,
  MXN: 2,
  MYR: 2,
  NOK: 2,
  NZD: 2,
  PHP: 2,
  PLN: 2,
  SEK: 2,
  VND: 0,
  SGD: 2,
  THB: 2,
  TRY: 2,
  TWD: 2,
  ZAR: 2,
};

/**
 * Currencies outside `MARKETPLACE_CURRENCIES` fall back to CLDR so a currency
 * enabled elsewhere cannot silently round at two decimals.
 */
function resolveFallbackScale(currency: string): number {
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  }
  catch {
    return 2;
  }
}

export function getCurrencyScale(currency: string): number {
  return CURRENCY_SCALES[currency as MarketplaceCurrency] ?? resolveFallbackScale(currency);
}
