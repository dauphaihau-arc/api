import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  QueueConfig,
  QUEUE_CONFIG,
  buildQueueConfig
} from '../../../config/queue.config';
import { MailModule } from '../mail/mail.module';
import Redis from 'ioredis';
import { SendWelcomeEmailJob } from '../../../common/jobs/send-welcome-email.job';
import { JobDispatcher } from './app/ports/job-dispatcher';
import { AppJobRunner } from './infra/app-job-runner';
import { BullMqConnectionManager } from './infra/bullmq-connection-manager';
import { BullMqJobDispatcher } from './infra/bullmq-job-dispatcher';
import { InlineJobDispatcher } from './infra/inline-job-dispatcher';
import { BULLMQ_CONNECTION } from './infra/queue.constants';

@Module({
  imports: [ConfigModule, MailModule],
  providers: [
    {
      provide: QUEUE_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildQueueConfig(configService),
    },
    {
      provide: BULLMQ_CONNECTION,
      inject: [QUEUE_CONFIG],
      useFactory: (queueConfig: QueueConfig) => {
        if (queueConfig.driver !== 'redis') {
          return null;
        }

        return new Redis(queueConfig.redisUrl, {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        });
      },
    },
    BullMqConnectionManager,
    AppJobRunner,
    SendWelcomeEmailJob,
    {
      provide: JobDispatcher,
      inject: [QUEUE_CONFIG, BULLMQ_CONNECTION, AppJobRunner],
      useFactory: (
        queueConfig: QueueConfig,
        connection: Redis | null,
        appJobRunner: AppJobRunner
      ) => {
        if (queueConfig.driver === 'redis') {
          if (!connection) {
            throw new Error(
              'Missing BullMQ Redis connection for redis queue driver'
            );
          }

          return new BullMqJobDispatcher(queueConfig, connection);
        }

        return new InlineJobDispatcher(appJobRunner);
      },
    },
  ],
  exports: [QUEUE_CONFIG, BULLMQ_CONNECTION, JobDispatcher, AppJobRunner],
})
export class QueueModule {}
