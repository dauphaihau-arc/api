export const MARKETPLACE_REGIONS = [
  'United States',
  'Vietnam',
] as const;

export const MARKETPLACE_LANGUAGES = ['en', 'la', 'fr'] as const;

export const MARKETPLACE_CURRENCIES = [
  'USD',
  'AUD',
  'EUR',
  'GBP',
  'CAD',
  'TWD',
  'JPY',
  'KRW',
  'HKD',
  'SGD',
  'VND',
] as const;

export type MarketplaceRegion = (typeof MARKETPLACE_REGIONS)[number];
export type MarketplaceLanguage = (typeof MARKETPLACE_LANGUAGES)[number];
export type MarketplaceCurrency = (typeof MARKETPLACE_CURRENCIES)[number];

export interface MarketPreferencesInput {
  region?: MarketplaceRegion;
  language?: MarketplaceLanguage;
  currency?: MarketplaceCurrency;
}

export interface MarketPreferences {
  region: MarketplaceRegion;
  language: MarketplaceLanguage;
  currency: MarketplaceCurrency;
}

export const DEFAULT_MARKET_PREFERENCES: MarketPreferences = {
  region: 'United States',
  language: 'en',
  currency: 'USD',
};

export function normalizeMarketPreferences(
  input?: MarketPreferencesInput
): MarketPreferences {
  return {
    region: input?.region ?? DEFAULT_MARKET_PREFERENCES.region,
    language: input?.language ?? DEFAULT_MARKET_PREFERENCES.language,
    currency: input?.currency ?? DEFAULT_MARKET_PREFERENCES.currency,
  };
}
