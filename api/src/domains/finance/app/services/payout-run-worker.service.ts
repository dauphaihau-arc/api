import ms from 'ms';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { QUEUE_CONFIG, type QueueConfig } from '~/platform/config/queue.config';
import { RunPayoutsUseCase } from '../use-cases/run-payouts/run-payouts.use-case';

/**
 * The worker-process interval that decides whether a Payout Run is due: the same
 * shape as the outbox workers, avoiding a new scheduling library. It ticks on a
 * coarse cadence and leaves the decision to the run itself, which pays an
 * opted-in shop at most once per platform month.
 */
@Injectable()
export class PayoutRunWorkerService
implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PayoutRunWorkerService.name);
  private interval?: NodeJS.Timeout;

  constructor(
    @Inject(QUEUE_CONFIG) private readonly queueConfig: QueueConfig,
    private readonly runPayoutsUseCase: RunPayoutsUseCase,
  ) {}

  onModuleInit(): void {
    if (this.queueConfig.driver !== 'redis') {
      return;
    }

    void this.tick();
    this.interval = setInterval(() => {
      void this.tick();
    }, ms('5m'));

    this.logger.log('Started payout run worker');
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private async tick(): Promise<void> {
    try {
      const summary = await this.runPayoutsUseCase.execute();

      if (summary.paidShopCount > 0) {
        this.logger.log(
          `Paid ${summary.paidShopCount} shop(s) in the payout run for ${summary.runDay}`,
        );
      }
    }
    catch (error) {
      this.logger.error(
        `Payout run failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
