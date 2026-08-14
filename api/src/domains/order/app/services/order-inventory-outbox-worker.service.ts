import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { QUEUE_CONFIG, type QueueConfig } from '../../../../platform/config/queue.config';
import { OrderInventoryOutboxPublisherService } from './order-inventory-outbox-publisher.service';

@Injectable()
export class OrderInventoryOutboxWorkerService
implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(OrderInventoryOutboxWorkerService.name);
  private interval?: NodeJS.Timeout;

  constructor(
    @Inject(QUEUE_CONFIG) private readonly queueConfig: QueueConfig,
    private readonly orderInventoryOutboxPublisherService: OrderInventoryOutboxPublisherService,
  ) {}

  onModuleInit(): void {
    if (this.queueConfig.driver !== 'redis') {
      return;
    }

    void this.tick();
    this.interval = setInterval(() => {
      void this.tick();
    }, 5_000);

    this.logger.log('Started inventory outbox worker');
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private async tick(): Promise<void> {
    const processedCount =
      await this.orderInventoryOutboxPublisherService.processPendingEvents(10);

    if (processedCount > 0) {
      this.logger.log(`Published ${processedCount} inventory outbox event(s)`);
    }
  }
}
