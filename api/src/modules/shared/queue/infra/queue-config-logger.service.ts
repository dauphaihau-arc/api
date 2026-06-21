import {
  Inject, Injectable, Logger, OnModuleInit, 
} from '@nestjs/common';
import { QUEUE_CONFIG } from '~/config/queue.config';
import type { QueueConfig } from '~/config/queue.config';

@Injectable()
export class QueueConfigLoggerService implements OnModuleInit {
  private readonly logger = new Logger(QueueConfigLoggerService.name);

  constructor(
    @Inject(QUEUE_CONFIG) private readonly queueConfig: QueueConfig,
  ) {}

  onModuleInit(): void {
    this.logger.log(
      `Resolved queue config driver=${this.queueConfig.driver} queue=${this.queueConfig.queueName} prefix=${this.queueConfig.prefix} redisConfigured=${this.queueConfig.redisUrl.length > 0}`,
    );
  }
}
