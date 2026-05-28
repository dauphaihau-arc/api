import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import {
  appJobDeduplicationKey,
  appJobName,
} from '~/common/jobs/job.types';
import {
  FX_RATE_SYNC_CONFIG,
  type FxRateSyncConfig,
} from '~/config/fx-rate-sync.config';
import { JobDispatcher } from '../queue/app/ports/job-dispatcher';

@Injectable()
export class ExchangeRateSyncSchedulerService
  implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ExchangeRateSyncSchedulerService.name);
  private intervalHandle?: NodeJS.Timeout;

  constructor(
    private readonly jobDispatcher: JobDispatcher,
    @Inject(FX_RATE_SYNC_CONFIG)
    private readonly fxRateSyncConfig: FxRateSyncConfig
  ) {}

  onModuleInit(): void {
    if (this.fxRateSyncConfig.provider === 'disabled') {
      this.logger.log('FX sync scheduler is disabled');
      return;
    }

    if (this.fxRateSyncConfig.runOnStartup) {
      void this.dispatchRefreshJob('startup');
    }

    this.intervalHandle = setInterval(() => {
      void this.dispatchRefreshJob('interval');
    }, this.fxRateSyncConfig.intervalMs);

    this.logger.log(
      `FX sync scheduler started with interval ${this.fxRateSyncConfig.intervalMs}ms`
    );
  }

  onApplicationShutdown(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }
  }

  private async dispatchRefreshJob(reason: 'startup' | 'interval'): Promise<void> {
    const requestedAt = new Date();
    const bucket = String(
      Math.floor(requestedAt.getTime() / this.fxRateSyncConfig.intervalMs)
    );

    await this.jobDispatcher.dispatch(
      appJobName.refreshExchangeRates,
      {
        requestedAt: requestedAt.toISOString(),
      },
      {
        deduplicationKey: appJobDeduplicationKey.refreshExchangeRates(bucket),
      }
    );

    this.logger.log(
      `Scheduled FX refresh job (${reason}) for ${requestedAt.toISOString()}`
    );
  }
}
