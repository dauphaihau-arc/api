import ms from 'ms';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { QUEUE_CONFIG, type QueueConfig } from '~/platform/config/queue.config';
import { OrderRefundService } from './order-refund.service';

/**
 * The worker-process interval that settles refunds a provider event never
 * reached. Same shape as the other outbox workers: it ticks on a coarse cadence
 * and leaves the decision to the sweep, which only revisits refunds that have
 * been pending long enough not to race the request that created them.
 */
@Injectable()
export class RefundReconciliationWorkerService
implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RefundReconciliationWorkerService.name);
  private interval?: NodeJS.Timeout;

  constructor(
    @Inject(QUEUE_CONFIG) private readonly queueConfig: QueueConfig,
    private readonly orderRefundService: OrderRefundService,
  ) {}

  onModuleInit(): void {
    if (this.queueConfig.driver !== 'redis') {
      return;
    }

    void this.tick();
    this.interval = setInterval(() => {
      void this.tick();
    }, ms('5m'));

    this.logger.log('Started refund reconciliation worker');
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private async tick(): Promise<void> {
    try {
      const resolved = await this.orderRefundService.reconcilePendingRefunds(10);

      if (resolved > 0) {
        this.logger.log(`Settled ${resolved} pending refund(s) from the provider`);
      }
    }
    catch (error) {
      this.logger.error(
        `Refund reconciliation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
