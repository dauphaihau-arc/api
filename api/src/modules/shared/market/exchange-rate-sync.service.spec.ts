import type { EntityManager } from '@mikro-orm/postgresql';
import { ExchangeRateSyncService } from './exchange-rate-sync.service';
import type { FxRateSyncConfig } from '~/config/fx-rate-sync.config';
import type { ExchangeRateProvider } from './exchange-rate-provider';

describe('ExchangeRateSyncService', () => {
  it('creates derived cross-currency rows from a USD-based provider feed', async () => {
    const persistedRecords: Array<Record<string, unknown>> = [];
    const activeRates: Array<Record<string, unknown>> = [];
    const repository = {
      find: jest.fn().mockResolvedValue(activeRates),
    };
    const transactionalEntityManager = {
      getRepository: jest.fn().mockReturnValue(repository),
      create: jest.fn((_: unknown, payload: Record<string, unknown>) => payload),
      persist: jest.fn((payload: Record<string, unknown>) => {
        persistedRecords.push(payload);
      }),
      flush: jest.fn().mockResolvedValue(undefined),
    };
    const entityManager = {
      fork: jest.fn().mockReturnValue({
        transactional: jest
          .fn()
          .mockImplementation(async (work: (em: typeof transactionalEntityManager) => Promise<unknown>) =>
            work(transactionalEntityManager)
          ),
      }),
    } as unknown as EntityManager;
    const fxRateSyncConfig: FxRateSyncConfig = {
      provider: 'open-exchange-rates',
      intervalMs: 60 * 60 * 1000,
      runOnStartup: false,
      baseCurrencies: ['USD', 'VND'],
      targetCurrencies: ['USD', 'VND', 'EUR'],
      openExchangeRatesAppId: 'test-app-id',
      openExchangeRatesBaseUrl: 'https://openexchangerates.org/api',
    };
    const exchangeRateProvider: ExchangeRateProvider = {
      getLatestRates: jest.fn().mockResolvedValue({
        source: 'open-exchange-rates',
        baseCurrency: 'USD',
        asOf: new Date('2026-05-27T00:00:00.000Z'),
        rates: {
          EUR: '0.88',
          VND: '25000',
        },
      }),
    };
    const service = new ExchangeRateSyncService(
      entityManager,
      fxRateSyncConfig,
      exchangeRateProvider
    );

    const result = await service.syncLatestRates();

    expect(result.pairsRequested).toBe(4);
    expect(result.createdCount).toBe(4);
    expect(result.updatedCount).toBe(0);
    expect(result.skippedCount).toBe(0);
    expect(persistedRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromCurrency: 'USD',
          toCurrency: 'VND',
          rate: '25000.0000000000',
        }),
        expect.objectContaining({
          fromCurrency: 'USD',
          toCurrency: 'EUR',
          rate: '0.8800000000',
        }),
        expect.objectContaining({
          fromCurrency: 'VND',
          toCurrency: 'USD',
          rate: '0.0000400000',
        }),
        expect.objectContaining({
          fromCurrency: 'VND',
          toCurrency: 'EUR',
          rate: '0.0000352000',
        }),
      ])
    );
  });
});
