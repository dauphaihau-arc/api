import { Logger, Module } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Queue } from 'bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  QueueConfig,
  QUEUE_CONFIG,
  buildQueueConfig,
} from '~/platform/config/queue.config';
import { ObservabilityModule } from '~/platform/observability/observability.module';
import { ObservabilityService } from '~/platform/observability/observability.service';
import Redis from 'ioredis';
import { JobDispatcher } from './app/ports/job-dispatcher';
import { BullMqConnectionManager } from './infra/bullmq-connection-manager';
import { BullMqJobDispatcher } from './infra/bullmq-job-dispatcher';
import { BullMqQueueManager } from './infra/bullmq-queue-manager';
import { InlineJobDispatcher } from './infra/inline-job-dispatcher';
import { QueueConfigLoggerService } from './infra/queue-config-logger.service';
import { BULLMQ_CONNECTION, BULLMQ_QUEUE } from './infra/queue.constants';

const queueModuleLogger = new Logger('QueueModule');

@Module({
  imports: [
    ConfigModule,
    ObservabilityModule,
  ],
  providers: [
    {
      provide: QUEUE_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildQueueConfig(configService),
    },
    {
      provide: BULLMQ_CONNECTION,
      inject: [QUEUE_CONFIG, ObservabilityService],
      useFactory: async (
        queueConfig: QueueConfig,
        observabilityService: ObservabilityService,
      ) => {
        if (queueConfig.driver !== 'redis') {
          queueModuleLogger.log(
            `Skipping BullMQ Redis bootstrap because queue driver is ${queueConfig.driver}`,
          );
          return null;
        }

        queueModuleLogger.log(
          `Connecting BullMQ Redis at ${queueConfig.redisUrl}`,
        );

        const connection = new Redis(queueConfig.redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          retryStrategy: () => null,
        });

        try {
          await connection.connect();
          queueModuleLogger.log('BullMQ Redis socket connected');
          await connection.ping();
          queueModuleLogger.log('BullMQ Redis ping succeeded');
        }
        catch (error) {
          queueModuleLogger.error(
            `Failed to connect BullMQ Redis at ${queueConfig.redisUrl}`,
            error instanceof Error ? error.stack : undefined,
          );

          connection.disconnect();
          throw error;
        }

        connection.on('error', () => {
          observabilityService.recordRedisConnectionError('bullmq');
        });

        return connection;
      },
    },
    {
      provide: BULLMQ_QUEUE,
      inject: [QUEUE_CONFIG, BULLMQ_CONNECTION, ObservabilityService],
      useFactory: (
        queueConfig: QueueConfig,
        connection: Redis | null,
        observabilityService: ObservabilityService,
      ) => {
        if (queueConfig.driver !== 'redis' || !connection) {
          observabilityService.attachBullMqQueue(null);
          return null;
        }

        const queue = new Queue(queueConfig.queueName, {
          connection,
          prefix: queueConfig.prefix,
        });

        observabilityService.attachBullMqQueue(queue);

        return queue;
      },
    },
    BullMqConnectionManager,
    BullMqQueueManager,
    QueueConfigLoggerService,
    {
      provide: JobDispatcher,
      inject: [QUEUE_CONFIG, BULLMQ_CONNECTION, ModuleRef],
      useFactory: (
        queueConfig: QueueConfig,
        connection: Redis | null,
        moduleRef: ModuleRef,
      ) => {
        if (queueConfig.driver === 'redis') {
          if (!connection) {
            throw new Error(
              'Missing BullMQ Redis connection for redis queue driver',
            );
          }

          return new BullMqJobDispatcher(queueConfig, connection);
        }

        return new InlineJobDispatcher(moduleRef);
      },
    },
  ],
  exports: [
    QUEUE_CONFIG,
    BULLMQ_CONNECTION,
    BULLMQ_QUEUE,
    JobDispatcher,
  ],
})
export class QueueModule {}
