import type { EntityManager } from '@mikro-orm/postgresql';
import type { MarketplaceCurrency } from '../../src/config/marketplace.config';
import { ExchangeRateEntity } from '../../src/modules/shared/market/infra/persistence/entities/exchange-rate.entity';
import {
  EXCHANGE_RATES_LOCAL_TSV_PATH,
  EXCHANGE_RATES_TSV_PATH,
} from './product-seed-paths';
import { readOptionalTsvRows, readTsvRows } from './shared/read-tsv-rows';

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

  for (const seed of exchangeRateSeeds) {
    const existing = await em.findOne(ExchangeRateEntity, {
      fromCurrency: seed.fromCurrency,
      toCurrency: seed.toCurrency,
    });

    if (existing) {
      existing.rate = seed.rate;
      existing.source = seed.source;
      existing.effectiveAt = new Date();
      existing.expiresAt = undefined;
      existing.sourceTimestamp = new Date();
      continue;
    }

    em.persist(em.create(ExchangeRateEntity, {
      fromCurrency: seed.fromCurrency,
      toCurrency: seed.toCurrency,
      rate: seed.rate,
      effectiveAt: new Date(),
      source: seed.source,
      sourceTimestamp: new Date(),
    }));
  }

  await em.flush();
}
