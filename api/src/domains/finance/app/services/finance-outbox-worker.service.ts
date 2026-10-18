import ms from 'ms';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { QUEUE_CONFIG, type QueueConfig } from '~/platform/config/queue.config';
import { FinanceMoneyEventProcessorService } from './finance-money-event-processor.service';

@Injectable()
export class FinanceOutboxWorkerService
implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(FinanceOutboxWorkerService.name);
  private interval?: NodeJS.Timeout;

  constructor(
    @Inject(QUEUE_CONFIG) private readonly queueConfig: QueueConfig,
    private readonly financeMoneyEventProcessorService: FinanceMoneyEventProcessorService,
  ) {}

  onModuleInit(): void {
    if (this.queueConfig.driver !== 'redis') {
      return;
    }

    void this.tick();
    this.interval = setInterval(() => {
      void this.tick();
    }, ms('5s'));

    this.logger.log('Started finance outbox worker');
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private async tick(): Promise<void> {
    const processedCount = await this.financeMoneyEventProcessorService.processPendingEvents(10);

    if (processedCount > 0) {
      this.logger.log(`Processed ${processedCount} finance outbox event(s)`);
    }
  }
}
