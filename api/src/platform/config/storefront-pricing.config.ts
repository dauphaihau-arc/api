import type { ConfigService } from '@nestjs/config';

export interface StorefrontPricingConfig {
  indexedPricePairs: Array<{
    marketCode: string;
    currency: string;
  }>;
  rarePriceCacheTtlMs: number;
}

export const STOREFRONT_PRICING_CONFIG = Symbol('STOREFRONT_PRICING_CONFIG');

export function buildStorefrontPricingConfig(
  configService: Pick<ConfigService, 'get'>,
): StorefrontPricingConfig {
  return {
    indexedPricePairs: parseIndexedPairs(
      configService.get<string>('STOREFRONT_INDEXED_PRICE_PAIRS', 'US:USD,EUR,GBP,JPY,AUD,CAD;VN:VND'),
    ),
    rarePriceCacheTtlMs: Number.parseInt(
      configService.get<string>('STOREFRONT_RARE_PRICE_CACHE_TTL_MS', '300000'),
      10,
    ) || 300_000,
  };
}

function parseIndexedPairs(value: string): StorefrontPricingConfig['indexedPricePairs'] {
  return value
    .split(';')
    .map((group) => group.trim())
    .filter(Boolean)
    .flatMap((group) => {
      const [marketCode, currenciesValue] = group.split(':').map((part) => part?.trim());

      if (!marketCode || !currenciesValue) {
        return [];
      }

      const currencies = currenciesValue
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);

      return currencies.map((currency) => ({
        marketCode,
        currency,
      }));
    });
}
