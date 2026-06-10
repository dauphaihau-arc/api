import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { FX_RATE_SYNC_CONFIG } from '~/config/fx-rate-sync.config';
import type { FxRateSyncConfig } from '~/config/fx-rate-sync.config';
import { ExchangeRateEntity } from './infra/persistence/entities/exchange-rate.entity';
import {
  EXCHANGE_RATE_PROVIDER,
  type ExchangeRateProvider,
  type ExchangeRateProviderQuote
} from './exchange-rate-provider';

export interface ExchangeRateSyncResult {
  fetchedAt: Date;
  pairsRequested: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
}

@Injectable()
export class ExchangeRateSyncService {
  private readonly logger = new Logger(ExchangeRateSyncService.name);

  constructor(
    private readonly entityManager: EntityManager,
    @Inject(FX_RATE_SYNC_CONFIG)
    private readonly fxRateSyncConfig: FxRateSyncConfig,
    @Inject(EXCHANGE_RATE_PROVIDER)
    private readonly exchangeRateProvider: ExchangeRateProvider
  ) {}

  async syncLatestRates(): Promise<ExchangeRateSyncResult> {
    const baseCurrencies = this.fxRateSyncConfig.baseCurrencies;
    const targetCurrencies = this.fxRateSyncConfig.targetCurrencies;
    const requestedPairs = buildCurrencyPairs(baseCurrencies, targetCurrencies);
    const providerCurrencies = [...new Set(requestedPairs.flatMap((pair) => [
      pair.fromCurrency,
      pair.toCurrency,
    ]).filter((currency) => currency !== 'USD'))];
    const fetchedAt = new Date();

    if (requestedPairs.length === 0) {
      this.logger.log('Skipped FX sync because no currency pairs were configured');
      return {
        fetchedAt,
        pairsRequested: 0,
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
      };
    }

    this.logger.log(
      `Starting FX sync for ${requestedPairs.length} pairs from bases [${baseCurrencies.join(', ')}] to targets [${targetCurrencies.join(', ')}]`
    );

    const quote = await this.exchangeRateProvider.getLatestRates({
      currencies: providerCurrencies,
    });

    const requestedRates = requestedPairs
      .map((pair) => {
        const rate = derivePairRate(quote, pair.fromCurrency, pair.toCurrency);

        if (!rate) {
          this.logger.warn(
            `Skipped FX pair ${pair.fromCurrency}/${pair.toCurrency} because provider data was incomplete`
          );
          return null;
        }

        return {
          ...pair,
          rate,
        };
      })
      .filter((entry): entry is {
        fromCurrency: string;
        toCurrency: string;
        rate: string;
      } => entry !== null);

    const result = await this.entityManager.fork().transactional(async (entityManager) => {
      const repository = entityManager.getRepository(ExchangeRateEntity);
      const activeRates = await repository.find(
        {
          fromCurrency: { $in: [...new Set(requestedRates.map((rate) => rate.fromCurrency))] },
          toCurrency: { $in: [...new Set(requestedRates.map((rate) => rate.toCurrency))] },
          expiresAt: null,
        },
        {
          orderBy: {
            effectiveAt: 'desc',
          },
        }
      );
      const activeRateByPair = new Map<string, ExchangeRateEntity>();

      for (const activeRate of activeRates) {
        const key = buildPairKey(activeRate.fromCurrency, activeRate.toCurrency);

        if (!activeRateByPair.has(key)) {
          activeRateByPair.set(key, activeRate);
        }
      }

      let createdCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      for (const nextRate of requestedRates) {
        const key = buildPairKey(nextRate.fromCurrency, nextRate.toCurrency);
        const existingRate = activeRateByPair.get(key);

        if (
          existingRate
          && existingRate.rate === nextRate.rate
          && existingRate.source === quote.source
        ) {
          skippedCount += 1;
          continue;
        }

        if (
          existingRate
          && existingRate.effectiveAt.getTime() === quote.asOf.getTime()
        ) {
          existingRate.rate = nextRate.rate;
          existingRate.source = quote.source;
          existingRate.sourceTimestamp = quote.asOf;
          updatedCount += 1;
          continue;
        }

        if (existingRate) {
          existingRate.expiresAt = quote.asOf;
          updatedCount += 1;
        }

        entityManager.persist(entityManager.create(ExchangeRateEntity, {
          fromCurrency: nextRate.fromCurrency,
          toCurrency: nextRate.toCurrency,
          rate: nextRate.rate,
          effectiveAt: quote.asOf,
          source: quote.source,
          sourceTimestamp: quote.asOf,
        }));
        createdCount += 1;
      }

      await entityManager.flush();

      return {
        createdCount,
        updatedCount,
        skippedCount,
      };
    });

    return {
      fetchedAt,
      pairsRequested: requestedPairs.length,
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
      skippedCount: result.skippedCount + (requestedPairs.length - requestedRates.length),
    };
  }
}

function buildCurrencyPairs(
  baseCurrencies: string[],
  targetCurrencies: string[]
): Array<{ fromCurrency: string; toCurrency: string }> {
  const pairs: Array<{ fromCurrency: string; toCurrency: string }> = [];

  for (const fromCurrency of baseCurrencies) {
    for (const toCurrency of targetCurrencies) {
      if (fromCurrency === toCurrency) {
        continue;
      }

      pairs.push({ fromCurrency, toCurrency });
    }
  }

  return pairs;
}

function derivePairRate(
  quote: ExchangeRateProviderQuote,
  fromCurrency: string,
  toCurrency: string
): string | null {
  const sourceBaseRate = getUsdRelativeRate(quote, fromCurrency);
  const sourceTargetRate = getUsdRelativeRate(quote, toCurrency);

  if (sourceBaseRate == null || sourceTargetRate == null || sourceBaseRate === 0) {
    return null;
  }

  return (sourceTargetRate / sourceBaseRate).toFixed(10);
}

function getUsdRelativeRate(
  quote: ExchangeRateProviderQuote,
  currency: string
): number | null {
  const normalizedCurrency = currency.trim().toUpperCase();

  if (normalizedCurrency === quote.baseCurrency) {
    return 1;
  }

  const rate = quote.rates[normalizedCurrency];

  if (!rate) {
    return null;
  }

  const numericRate = Number(rate);
  return Number.isFinite(numericRate) ? numericRate : null;
}

function buildPairKey(fromCurrency: string, toCurrency: string): string {
  return `${fromCurrency}->${toCurrency}`;
}
