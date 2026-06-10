import { Inject, Injectable, Logger } from '@nestjs/common';
import { FX_RATE_SYNC_CONFIG } from '~/config/fx-rate-sync.config';
import type { FxRateSyncConfig } from '~/config/fx-rate-sync.config';
import type {
  ExchangeRateProvider,
  ExchangeRateProviderQuote
} from './exchange-rate-provider';

interface OpenExchangeRatesLatestResponse {
  disclaimer?: string;
  license?: string;
  timestamp?: number;
  base?: string;
  rates?: Record<string, number>;
  error?: boolean;
  status?: number;
  message?: string;
  description?: string;
}

@Injectable()
export class OpenExchangeRatesProvider implements ExchangeRateProvider {
  private readonly logger = new Logger(OpenExchangeRatesProvider.name);

  constructor(
    @Inject(FX_RATE_SYNC_CONFIG)
    private readonly fxRateSyncConfig: FxRateSyncConfig
  ) {}

  async getLatestRates(input: {
    currencies: string[];
  }): Promise<ExchangeRateProviderQuote> {
    if (!this.fxRateSyncConfig.openExchangeRatesAppId) {
      throw new Error('Missing OPEN_EXCHANGE_RATES_APP_ID for FX sync.');
    }

    const symbols = [...new Set(input.currencies.map((currency) => currency.trim().toUpperCase()))]
      .filter(Boolean)
      .join(',');
    const requestUrl = new URL(
      'latest.json',
      ensureTrailingSlash(this.fxRateSyncConfig.openExchangeRatesBaseUrl)
    );

    requestUrl.searchParams.set(
      'app_id',
      this.fxRateSyncConfig.openExchangeRatesAppId
    );

    if (symbols.length > 0) {
      requestUrl.searchParams.set('symbols', symbols);
    }

    this.logger.log(
      `Fetching FX rates from Open Exchange Rates for ${symbols || 'all configured currencies'}`
    );

    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const responseBody = await response.text();

      throw new Error(
        `Open Exchange Rates request failed with status ${response.status}: ${responseBody}`
      );
    }

    const payload =
      (await response.json()) as OpenExchangeRatesLatestResponse;

    if (payload.error) {
      throw new Error(
        `Open Exchange Rates error: ${payload.message ?? payload.description ?? 'Unknown error'}`
      );
    }

    if (!payload.timestamp || !payload.base || !payload.rates) {
      throw new Error('Open Exchange Rates response is missing required fields.');
    }

    this.logger.log(
      `Fetched FX rates from Open Exchange Rates with base ${payload.base.toUpperCase()} at ${new Date(payload.timestamp * 1_000).toISOString()}`
    );

    return {
      source: 'open-exchange-rates',
      baseCurrency: payload.base.toUpperCase(),
      asOf: new Date(payload.timestamp * 1_000),
      rates: Object.fromEntries(
        Object.entries(payload.rates).map(([currency, rate]) => [
          currency.toUpperCase(),
          String(rate),
        ])
      ),
    };
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}
