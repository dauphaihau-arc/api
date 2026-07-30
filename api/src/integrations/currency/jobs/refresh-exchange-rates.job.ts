import { Injectable, Logger } from '@nestjs/common';
import { ExchangeRateSyncService } from '~/integrations/currency/exchange-rate-sync.service';

@Injectable()
export class RefreshExchangeRatesJob {
  private readonly logger = new Logger(RefreshExchangeRatesJob.name);

  constructor(
    private readonly exchangeRateSyncService: ExchangeRateSyncService,
  ) {}

  async run(): Promise<void> {
    const result = await this.exchangeRateSyncService.syncLatestRates();

    this.logger.log(
      `Processed FX refresh job: requested=${result.pairsRequested} created=${result.createdCount} expired=${result.updatedCount} skipped=${result.skippedCount}`,
    );
  }
}
