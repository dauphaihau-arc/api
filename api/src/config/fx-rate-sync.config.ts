import type { ConfigService } from '@nestjs/config';
import {
  MARKETPLACE_MARKETS,
  type MarketplaceCurrency,
} from './marketplace.config';
import { parseDurationToMilliseconds } from '../libs/duration';

export interface FxRateSyncConfig {
  provider: 'disabled' | 'open-exchange-rates';
  intervalMs: number;
  runOnStartup: boolean;
  baseCurrencies: MarketplaceCurrency[];
  targetCurrencies: MarketplaceCurrency[];
  openExchangeRatesAppId?: string;
  openExchangeRatesBaseUrl: string;
}

export const FX_RATE_SYNC_CONFIG = Symbol('FX_RATE_SYNC_CONFIG');

export function buildFxRateSyncConfig(
  configService: Pick<ConfigService, 'get'>
): FxRateSyncConfig {
  return {
    provider: configService.get<FxRateSyncConfig['provider']>(
      'FX_RATE_SYNC_PROVIDER',
      'disabled'
    ),
    intervalMs: parseDurationToMilliseconds(
      configService.get<string>('FX_RATE_SYNC_INTERVAL', '1h'),
      60 * 60 * 1000
    ),
    runOnStartup:
      configService.get<string>('FX_RATE_SYNC_RUN_ON_STARTUP', 'false') ===
      'true',
    baseCurrencies: getEnabledMarketCurrencies(),
    targetCurrencies: getEnabledMarketCurrencies(),
    openExchangeRatesAppId: configService.get<string>(
      'OPEN_EXCHANGE_RATES_APP_ID'
    ),
    openExchangeRatesBaseUrl: configService.get<string>(
      'OPEN_EXCHANGE_RATES_BASE_URL',
      'https://openexchangerates.org/api'
    ),
  };
}

function getEnabledMarketCurrencies(): MarketplaceCurrency[] {
  return [...new Set(
    MARKETPLACE_MARKETS
      .filter((market) => market.enabled)
      .flatMap((market) => market.supportedCurrencies)
  )];
}
