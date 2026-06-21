/* eslint-disable @stylistic/indent */
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { QUEUE_CONFIG } from '~/config/queue.config';
import type { QueueConfig } from '~/config/queue.config';
import type {
  AppJobName,
  AppJobPayloadMap,
} from '~/common/jobs/job.types';
import { AppJobRunner } from './app-job-runner';
import { BULLMQ_CONNECTION } from './queue.constants';

type AppQueueJob = Job<AppJobPayloadMap[AppJobName], unknown, AppJobName>;

@Injectable()
export class BullMqWorkerService
  implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(BullMqWorkerService.name);
  private worker?: Worker<AppJobPayloadMap[AppJobName], unknown, AppJobName>;

  constructor(
    @Inject(QUEUE_CONFIG) private readonly queueConfig: QueueConfig,
    @Inject(BULLMQ_CONNECTION) private readonly connection: Redis | null,
    private readonly appJobRunner: AppJobRunner,
  ) {}

  onModuleInit(): void {
    if (this.queueConfig.driver !== 'redis') {
      this.logger.log(
        `Queue driver ${this.queueConfig.driver} does not require a worker process`,
      );
      return;
    }

    if (!this.connection) {
      throw new Error('Missing BullMQ Redis connection for redis queue driver');
    }

    this.worker = new Worker<AppJobPayloadMap[AppJobName], unknown, AppJobName>(
      this.queueConfig.queueName,
      async (job) => this.processJob(job),
      {
        connection: this.connection,
        prefix: this.queueConfig.prefix,
        concurrency: this.queueConfig.workerConcurrency,
      },
    );

    this.worker.on('active', (job) => {
      this.logger.log(`Started job ${job.name} (${job.id ?? 'unknown'})`);
    });

    this.worker.on('completed', (job) => {
      this.logger.log(`Completed job ${job.name} (${job.id ?? 'unknown'})`);
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Job ${job?.name ?? 'unknown'} (${job?.id ?? 'unknown'}) failed: ${error.message}`,
        error.stack,
      );
    });

    this.logger.log(
      `Started BullMQ worker for queue ${this.queueConfig.queueName}`,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }

  private async processJob(job: AppQueueJob): Promise<void> {
    await this.appJobRunner.run(job.name, job.data);
  }
}
