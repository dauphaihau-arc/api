import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { ExchangeRateEntity } from './infra/persistence/entities/exchange-rate.entity';

export interface ExchangeRateSnapshot {
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  effectiveAt: Date;
  source: string;
  sourceTimestamp?: Date;
}

export interface FxRateLookup {
  fromCurrency: string;
  toCurrency: string;
  at?: Date;
}

/**
 * Per-request cache of in-flight rate lookups. Callers own the map so a cache
 * never outlives the request it belongs to, and `getLatestRate` owns the key
 * format so every caller caches the same lookup under the same key.
 */
export type FxRateCache = Map<string, Promise<ExchangeRateSnapshot | null>>;

@Injectable()
export class FxRateService {
  constructor(private readonly entityManager: EntityManager) {}

  async getLatestRate(
    input: FxRateLookup,
    cache?: FxRateCache,
  ): Promise<ExchangeRateSnapshot | null> {
    if (input.fromCurrency === input.toCurrency) {
      return {
        fromCurrency: input.fromCurrency,
        toCurrency: input.toCurrency,
        rate: '1',
        effectiveAt: input.at ?? new Date(),
        source: 'identity',
      };
    }

    if (!cache) {
      return this.loadLatestRate(input);
    }

    const cacheKey = buildFxRateCacheKey(input);
    const cached = cache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const pending = this.loadLatestRate(input);
    cache.set(cacheKey, pending);

    return pending;
  }

  private async loadLatestRate(input: FxRateLookup): Promise<ExchangeRateSnapshot | null> {
    const asOf = input.at ?? new Date();
    const repository = this.entityManager.fork().getRepository(ExchangeRateEntity);

    const rate = await repository.findOne(
      {
        fromCurrency: input.fromCurrency,
        toCurrency: input.toCurrency,
        effectiveAt: { $lte: asOf },
        $or: [
          { expiresAt: null },
          { expiresAt: { $gt: asOf } },
        ],
      },
      {
        orderBy: {
          effectiveAt: 'desc',
        },
      },
    );

    if (!rate) {
      return null;
    }

    return {
      fromCurrency: rate.fromCurrency,
      toCurrency: rate.toCurrency,
      rate: rate.rate,
      effectiveAt: rate.effectiveAt,
      source: rate.source,
      sourceTimestamp: rate.sourceTimestamp,
    };
  }
}

function buildFxRateCacheKey(input: FxRateLookup): string {
  return `${input.fromCurrency}:${input.toCurrency}:${input.at?.toISOString() ?? 'latest'}`;
}
