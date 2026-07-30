import type { EntityManager } from '@mikro-orm/postgresql';
import type { MarketplaceCurrency } from '~/platform/config/marketplace.config';
import { ExchangeRateEntity } from '~/integrations/currency/infra/persistence/entities/exchange-rate.entity';
import {
  EXCHANGE_RATES_LOCAL_TSV_PATH,
  EXCHANGE_RATES_TSV_PATH,
} from './product-seed-paths';
import { readOptionalTsvRows, readTsvRows } from './shared/read-tsv-rows';

function resolveProgressInterval(total: number, maxSteps = 5): number {
  return Math.max(1, Math.ceil(total / maxSteps));
}

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }

  return `${(ms / 1_000).toFixed(1)}s`;
}

type ExchangeRateSeed = {
  fromCurrency: MarketplaceCurrency;
  toCurrency: MarketplaceCurrency;
  rate: string;
  source: string;
};

type ExchangeRateSeedRow = {
  from_currency: string;
  to_currency: string;
  rate: string;
  source: string;
};

function loadExchangeRateSeeds(): ExchangeRateSeed[] {
  return [
    ...readTsvRows<ExchangeRateSeedRow>(EXCHANGE_RATES_TSV_PATH),
    ...readOptionalTsvRows<ExchangeRateSeedRow>(EXCHANGE_RATES_LOCAL_TSV_PATH),
  ].map((row, index) => {
    const rowKey = `${row.from_currency}->${row.to_currency}#${index + 2}`;

    if (!row.from_currency.trim()) {
      throw new Error(`Missing from_currency for exchange rate seed ${rowKey}`);
    }

    if (!row.to_currency.trim()) {
      throw new Error(`Missing to_currency for exchange rate seed ${rowKey}`);
    }

    if (!row.rate.trim()) {
      throw new Error(`Missing rate for exchange rate seed ${rowKey}`);
    }

    return {
      fromCurrency: row.from_currency.trim().toUpperCase() as MarketplaceCurrency,
      toCurrency: row.to_currency.trim().toUpperCase() as MarketplaceCurrency,
      rate: row.rate.trim(),
      source: row.source.trim() || 'demo-seed',
    };
  });
}

export async function seedExchangeRates(em: EntityManager): Promise<void> {
  const exchangeRateSeeds = loadExchangeRateSeeds();
  const progressInterval = resolveProgressInterval(exchangeRateSeeds.length);
  const startedAt = Date.now();
  const existingRates = await em.find(ExchangeRateEntity, {});
  const existingRatesByPair = new Map(
    existingRates.map((rate) => [`${rate.fromCurrency}::${rate.toCurrency}`, rate]),
  );

  console.log(`[seed][exchange-rates] Upserting ${exchangeRateSeeds.length} exchange rates`);

  for (const [index, seed] of exchangeRateSeeds.entries()) {
    const pairKey = `${seed.fromCurrency}::${seed.toCurrency}`;
    const existing = existingRatesByPair.get(pairKey);

    if (existing) {
      existing.rate = seed.rate;
      existing.source = seed.source;
      existing.effectiveAt = new Date();
      existing.expiresAt = undefined;
      existing.sourceTimestamp = new Date();
    }
    else {
      const exchangeRate = em.create(ExchangeRateEntity, {
        fromCurrency: seed.fromCurrency,
        toCurrency: seed.toCurrency,
        rate: seed.rate,
        effectiveAt: new Date(),
        source: seed.source,
        sourceTimestamp: new Date(),
      });
      existingRatesByPair.set(pairKey, exchangeRate);
      em.persist(exchangeRate);
    }

    if (
      (index + 1) % progressInterval === 0
      || index + 1 === exchangeRateSeeds.length
    ) {
      console.log(
        `[seed][exchange-rates] Processed ${index + 1}/${exchangeRateSeeds.length} exchange rates in ${formatDuration(Date.now() - startedAt)}`,
      );
    }
  }

  await em.flush();
}
