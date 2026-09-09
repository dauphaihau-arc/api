import type { OnApplicationShutdown } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { QueueConfig } from '~/platform/config/queue.config';
import type {
  AppJobName,
  AppJobPayloadMap,
  DispatchJobOptions,
} from '~/platform/jobs/app-job.types';
import type { JobDispatcher } from '../app/ports/job-dispatcher';

export class BullMqJobDispatcher
implements JobDispatcher, OnApplicationShutdown {
  private readonly logger = new Logger(BullMqJobDispatcher.name);
  private readonly queue: Queue;

  constructor(
    private readonly queueConfig: QueueConfig,
    connection: Redis,
  ) {
    this.queue = new Queue(queueConfig.queueName, {
      connection,
      prefix: queueConfig.prefix,
      defaultJobOptions: {
        attempts: queueConfig.defaultAttempts,
        backoff: {
          type: 'exponential',
          delay: queueConfig.defaultBackoffMilliseconds,
        },
        removeOnComplete: {
          age: queueConfig.removeCompletedAfterSeconds,
        },
        removeOnFail: {
          age: queueConfig.removeFailedAfterSeconds,
        },
      },
    });
  }

  async dispatch<TName extends AppJobName>(
    name: TName,
    payload: AppJobPayloadMap[TName],
    options?: DispatchJobOptions,
  ): Promise<void> {
    const deduplicationKey = options?.deduplicationKey;

    const coalesceLatest = deduplicationKey
      && options?.deduplicationMode === 'coalesce-latest';

    const job = await this.queue.add(name, payload, {
      jobId: coalesceLatest ? undefined : deduplicationKey,
      deduplication: coalesceLatest
        ? {
          id: deduplicationKey,
          keepLastIfActive: true,
        }
        : undefined,
      delay: options?.delayMs,
    });

    this.logger.log(
      `Enqueued job ${name} with id ${job.id ?? 'unknown'}`,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}
