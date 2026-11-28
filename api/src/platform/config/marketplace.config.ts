import { isValidCountryCode } from 'lib-address';

export const MARKETPLACE_REGIONS = [
  'United States',
  'Vietnam',
] as const;

export const STOREFRONT_LANGUAGES = ['en', 'vi'] as const;

export const MARKETPLACE_CURRENCIES = [
  'USD',
  'AUD',
  'BRL',
  'CHF',
  'CNY',
  'CZK',
  'DKK',
  'EUR',
  'GBP',
  'CAD',
  'HKD',
  'HUF',
  'IDR',
  'ILS',
  'INR',
  'JPY',
  'KRW',
  'MAD',
  'MXN',
  'MYR',
  'NOK',
  'NZD',
  'PHP',
  'PLN',
  'SEK',
  'VND',
  'SGD',
  'THB',
  'TRY',
  'TWD',
  'ZAR',
] as const;

export const MARKETPLACE_LOCALES = [
  'en-US',
  'vi-US',
  'vi-VN',
  'en-VN',
] as const;

export type MarketplaceRegion = (typeof MARKETPLACE_REGIONS)[number];
export type StorefrontLanguage = (typeof STOREFRONT_LANGUAGES)[number];
export type MarketplaceCurrency = (typeof MARKETPLACE_CURRENCIES)[number];
export type MarketplaceLocale = (typeof MARKETPLACE_LOCALES)[number];

export const DEFAULT_STOREFRONT_LANGUAGE: StorefrontLanguage = 'en';

export interface MarketplaceMarket {
  code: string;
  name: MarketplaceRegion;
  /** The country used as the buyer-facing Preview Destination for this Market. */
  previewCountryCode: string;
  defaultCurrency: MarketplaceCurrency;
  supportedCurrencies: MarketplaceCurrency[];
  defaultLocale: MarketplaceLocale;
  supportedLocales: MarketplaceLocale[];
  enabled: boolean;
}

/**
 * A Market's preview country is buyer-facing configuration, so a broken value
 * must fail deployment rather than silently disabling shipping previews.
 * Disabled Markets are not validated because no buyer can select them.
 */
export function validateMarketplaceMarkets(markets: readonly MarketplaceMarket[]): void {
  for (const market of markets) {
    if (!market.enabled) {
      continue;
    }

    const previewCountryCode = market.previewCountryCode;

    if (
      typeof previewCountryCode !== 'string'
      || previewCountryCode !== previewCountryCode.trim().toUpperCase()
      || !isValidCountryCode(previewCountryCode)
    ) {
      throw new Error(
        `Market "${market.name}" (${market.code}) must declare a valid ISO 3166-1 alpha-2 preview country, received "${String(previewCountryCode ?? '')}"`,
      );
    }
  }
}

export const MARKETPLACE_MARKETS: MarketplaceMarket[] = [
  {
    code: 'US',
    name: 'United States',
    previewCountryCode: 'US',
    defaultCurrency: 'USD',
    supportedCurrencies: [...MARKETPLACE_CURRENCIES],
    defaultLocale: 'en-US',
    supportedLocales: ['en-US', 'vi-US'],
    enabled: true,
  },
  {
    code: 'VN',
    name: 'Vietnam',
    previewCountryCode: 'VN',
    defaultCurrency: 'VND',
    supportedCurrencies: [...MARKETPLACE_CURRENCIES],
    defaultLocale: 'vi-VN',
    supportedLocales: ['vi-VN', 'en-VN'],
    enabled: true,
  },
] as const;

validateMarketplaceMarkets(MARKETPLACE_MARKETS);

export interface UserPreferencesInput {
  region?: MarketplaceRegion;
  language?: StorefrontLanguage;
  currency?: MarketplaceCurrency;
}

export interface UserPreferences {
  region: MarketplaceRegion;
  language: StorefrontLanguage;
  currency: MarketplaceCurrency;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  region: 'United States',
  language: DEFAULT_STOREFRONT_LANGUAGE,
  currency: 'USD',
};

export function normalizeUserPreferences(
  input?: UserPreferencesInput,
): UserPreferences {
  return {
    region: input?.region ?? DEFAULT_USER_PREFERENCES.region,
    language: input?.language ?? DEFAULT_USER_PREFERENCES.language,
    currency: input?.currency ?? DEFAULT_USER_PREFERENCES.currency,
  };
}
