import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { QUEUE_CONFIG, type QueueConfig } from '~/platform/config/queue.config';
import { OrderCheckoutOutboxService } from './order-checkout-outbox.service';

@Injectable()
export class OrderCheckoutOutboxWorkerService
implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(OrderCheckoutOutboxWorkerService.name);
  private interval?: NodeJS.Timeout;

  constructor(
    @Inject(QUEUE_CONFIG) private readonly queueConfig: QueueConfig,
    private readonly orderCheckoutOutboxService: OrderCheckoutOutboxService,
  ) {}

  onModuleInit(): void {
    if (this.queueConfig.driver !== 'redis') {
      return;
    }

    void this.tick();
    this.interval = setInterval(() => {
      void this.tick();
    }, 5_000);

    this.logger.log('Started checkout outbox worker');
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private async tick(): Promise<void> {
    const processedCount = await this.orderCheckoutOutboxService.processPendingEvents(10);

    if (processedCount > 0) {
      this.logger.log(`Processed ${processedCount} checkout outbox event(s)`);
    }
  }
}
