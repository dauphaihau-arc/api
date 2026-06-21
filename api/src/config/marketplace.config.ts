export const MARKETPLACE_REGIONS = [
  'United States',
  'Vietnam',
] as const;

export const MARKETPLACE_LANGUAGES = ['en', 'la', 'fr'] as const;

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
  'vi-VN',
  'en-VN',
] as const;

export type MarketplaceRegion = (typeof MARKETPLACE_REGIONS)[number];
export type MarketplaceLanguage = (typeof MARKETPLACE_LANGUAGES)[number];
export type MarketplaceCurrency = (typeof MARKETPLACE_CURRENCIES)[number];
export type MarketplaceLocale = (typeof MARKETPLACE_LOCALES)[number];

export interface MarketplaceMarket {
  code: string;
  name: string;
  defaultCurrency: MarketplaceCurrency;
  supportedCurrencies: MarketplaceCurrency[];
  defaultLocale: MarketplaceLocale;
  supportedLocales: MarketplaceLocale[];
  enabled: boolean;
}

export const MARKETPLACE_MARKETS: MarketplaceMarket[] = [
  {
    code: 'US',
    name: 'United States',
    defaultCurrency: 'USD',
    supportedCurrencies: [...MARKETPLACE_CURRENCIES],
    defaultLocale: 'en-US',
    supportedLocales: ['en-US'],
    enabled: true,
  },
  {
    code: 'VN',
    name: 'Vietnam',
    defaultCurrency: 'VND',
    supportedCurrencies: [...MARKETPLACE_CURRENCIES],
    defaultLocale: 'vi-VN',
    supportedLocales: ['vi-VN', 'en-VN'],
    enabled: true,
  },
] as const;

export interface UserPreferencesInput {
  region?: MarketplaceRegion;
  language?: MarketplaceLanguage;
  currency?: MarketplaceCurrency;
}

export interface UserPreferences {
  region: MarketplaceRegion;
  language: MarketplaceLanguage;
  currency: MarketplaceCurrency;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  region: 'United States',
  language: 'en',
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
