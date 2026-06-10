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

@Injectable()
export class FxRateService {
  constructor(private readonly entityManager: EntityManager) {}

  async getLatestRate(input: {
    fromCurrency: string;
    toCurrency: string;
    at?: Date;
  }): Promise<ExchangeRateSnapshot | null> {
    if (input.fromCurrency === input.toCurrency) {
      return {
        fromCurrency: input.fromCurrency,
        toCurrency: input.toCurrency,
        rate: '1',
        effectiveAt: input.at ?? new Date(),
        source: 'identity',
      };
    }

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
      }
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
