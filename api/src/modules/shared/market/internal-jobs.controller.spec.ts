import { HttpException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type {
  ExchangeRateSyncResult,
  ExchangeRateSyncService
} from './exchange-rate-sync.service';
import { InternalJobsController } from './internal-jobs.controller';

describe('InternalJobsController', () => {
  const syncResult: ExchangeRateSyncResult = {
    fetchedAt: new Date('2026-05-29T12:00:00.000Z'),
    pairsRequested: 6,
    createdCount: 2,
    updatedCount: 3,
    skippedCount: 1,
  };

  function buildController(secret?: string) {
    const exchangeRateSyncService = {
      syncLatestRates: jest.fn().mockResolvedValue(syncResult),
    } as unknown as jest.Mocked<ExchangeRateSyncService>;
    const configService = {
      get: jest.fn((key: string) =>
        key === 'FX_SYNC_TRIGGER_SECRET' ? secret : undefined
      ),
    } as unknown as jest.Mocked<ConfigService>;

    return {
      controller: new InternalJobsController(
        exchangeRateSyncService,
        configService
      ),
      exchangeRateSyncService,
    };
  }

  it('runs FX sync when the cron secret matches', async () => {
    const { controller, exchangeRateSyncService } = buildController('secret');

    await expect(controller.syncFxRates('secret')).resolves.toEqual({
      ok: true,
      fetchedAt: '2026-05-29T12:00:00.000Z',
      pairsRequested: 6,
      createdCount: 2,
      updatedCount: 3,
      skippedCount: 1,
    });
    expect(exchangeRateSyncService.syncLatestRates).toHaveBeenCalledTimes(1);
  });

  it('rejects requests with an invalid cron secret', async () => {
    const { controller, exchangeRateSyncService } = buildController('secret');

    await expect(controller.syncFxRates('wrong')).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(exchangeRateSyncService.syncLatestRates).not.toHaveBeenCalled();
  });

  it('returns service unavailable when the cron secret is not configured', async () => {
    const { controller, exchangeRateSyncService } = buildController();

    await expect(controller.syncFxRates('anything')).rejects.toBeInstanceOf(
      HttpException
    );
    await expect(controller.syncFxRates('anything')).rejects.toMatchObject({
      status: 503,
    });
    expect(exchangeRateSyncService.syncLatestRates).not.toHaveBeenCalled();
  });
});
