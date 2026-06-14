import { Injectable } from '@nestjs/common';
import {
  MARKETPLACE_MARKETS,
  type MarketplaceLocale,
  type MarketplaceMarket
} from '~/config/marketplace.config';
import { UserPreferenceRepository } from '~/modules/domains/auth/app/ports/user-preference.repository';
import { RequestContextService } from '~/modules/shared/request-context/request-context.service';

export interface StorefrontMarketContext {
  marketCode: string;
  currency: string;
  locale: string;
  requestedCurrency?: string;
  source: 'user_preferences' | 'request_headers';
}

@Injectable()
export class StorefrontMarketContextService {
  constructor(
    private readonly requestContextService: RequestContextService,
    private readonly userPreferenceRepository: UserPreferenceRepository
  ) {}

  async resolveCurrentRequest(): Promise<StorefrontMarketContext | undefined> {
    const cached = this.requestContextService.getStorefrontMarketContext();

    if (cached) {
      return cached;
    }

    const requestContext = this.requestContextService.get();
    const actorId = requestContext.actorId?.trim();

    if (actorId) {
      const preferences = await this.userPreferenceRepository.findByUserId(actorId);
      const resolvedFromPreferences = preferences
        ? resolveFromUserPreferences(preferences.region, preferences.currency, preferences.language)
        : undefined;

      if (resolvedFromPreferences) {
        this.requestContextService.setStorefrontMarketContext(resolvedFromPreferences);
        return resolvedFromPreferences;
      }
    }

    const resolvedFromHeaders = resolveFromRequestHeaders({
      marketCode: requestContext.marketCode,
      currency: requestContext.currency,
      locale: requestContext.locale,
    });

    if (resolvedFromHeaders) {
      this.requestContextService.setStorefrontMarketContext(resolvedFromHeaders);
    }

    return resolvedFromHeaders;
  }

  async getCurrentSortPriceKey(): Promise<string | undefined> {
    const context = await this.resolveCurrentRequest();

    if (!context) {
      return undefined;
    }

    const market = MARKETPLACE_MARKETS.find((entry) => entry.code === context.marketCode && entry.enabled);

    if (!market || market.defaultCurrency !== context.currency) {
      return undefined;
    }

    return `${market.code}:${market.defaultCurrency}`;
  }
}

function resolveFromUserPreferences(
  region?: string,
  currency?: string,
  language?: string
): StorefrontMarketContext | undefined {
  const market = MARKETPLACE_MARKETS.find((entry) => entry.name === region && entry.enabled);

  if (!market) {
    return undefined;
  }

  return {
    marketCode: market.code,
    currency: market.supportedCurrencies.includes(currency as never)
      ? currency ?? market.defaultCurrency
      : market.defaultCurrency,
    locale: resolveLocale(market, language),
    requestedCurrency: currency?.trim() || undefined,
    source: 'user_preferences',
  };
}

function resolveFromRequestHeaders(context: {
  marketCode?: string;
  currency?: string;
  locale?: string;
}): StorefrontMarketContext | undefined {
  const marketCode = context.marketCode?.trim();
  const market = marketCode
    ? MARKETPLACE_MARKETS.find((entry) => entry.code === marketCode && entry.enabled)
    : undefined;

  if (!market) {
    return undefined;
  }

  const requestedCurrency = context.currency?.trim();
  const currency = requestedCurrency && market.supportedCurrencies.includes(requestedCurrency as never)
    ? requestedCurrency
    : market.defaultCurrency;
  const requestedLocale = context.locale?.trim();
  const locale = requestedLocale && market.supportedLocales.includes(requestedLocale as MarketplaceLocale)
    ? requestedLocale
    : market.defaultLocale;

  return {
    marketCode: market.code,
    currency,
    locale,
    requestedCurrency,
    source: 'request_headers',
  };
}

function resolveLocale(market: MarketplaceMarket, language?: string): string {
  const normalizedLanguage = language?.trim().toLowerCase();

  if (!normalizedLanguage) {
    return market.defaultLocale;
  }

  return market.supportedLocales.find((locale) =>
    locale.split('-')[0]?.toLowerCase() === normalizedLanguage
  ) ?? market.defaultLocale;
}
