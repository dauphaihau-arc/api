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
  input?: UserPreferencesInput
): UserPreferences {
  return {
    region: input?.region ?? DEFAULT_USER_PREFERENCES.region,
    language: input?.language ?? DEFAULT_USER_PREFERENCES.language,
    currency: input?.currency ?? DEFAULT_USER_PREFERENCES.currency,
  };
}
