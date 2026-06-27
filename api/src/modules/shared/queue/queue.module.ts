import { forwardRef, Logger, Module } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  QueueConfig,
  QUEUE_CONFIG,
  buildQueueConfig,
} from '~/config/queue.config';
import { ObservabilityModule } from '../observability/observability.module';
import { ObservabilityService } from '../observability/observability.service';
import { MailModule } from '../mail/mail.module';
import { PaymentModule } from '../payment/payment.module';
import { StorageModule } from '../storage/storage.module';
import Redis from 'ioredis';
import { RefreshExchangeRatesJob } from '~/common/jobs/refresh-exchange-rates.job';
import { GenerateProductImageVariantsJob } from '~/common/jobs/generate-product-image-variants.job';
import { GenerateReviewImageVariantsJob } from '~/common/jobs/generate-review-image-variants.job';
import { ProjectCatalogProductJob } from '~/common/jobs/project-catalog-product.job';
import { CleanupPendingReviewImageJob } from '~/common/jobs/cleanup-pending-review-image.job';
import { CleanupExpiredCheckoutQuoteReservationsJob } from '~/common/jobs/cleanup-expired-checkout-quote-reservations.job';
import { RefreshBestSellerRankingsJob } from '~/common/jobs/refresh-best-seller-rankings.job';
import { SendGuestOrderConfirmationEmailJob } from '~/common/jobs/send-guest-order-confirmation-email.job';
import { SendPasswordResetEmailJob } from '~/common/jobs/send-password-reset-email.job';
import { SendRefundFailedEmailJob } from '~/common/jobs/send-refund-failed-email.job';
import { SendRefundSucceededEmailJob } from '~/common/jobs/send-refund-succeeded-email.job';
import { SendSellerOrderUpdateEmailJob } from '~/common/jobs/send-seller-order-update-email.job';
import { SendWelcomeEmailJob } from '~/common/jobs/send-welcome-email.job';
import { OrderModule } from '~/modules/domains/order/order.module';
import { ProductModule } from '~/modules/domains/product/product.module';
import { NotificationModule } from '../notification/notification.module';
import { CurrencyModule } from '../currency/currency.module';
import { JobDispatcher } from './app/ports/job-dispatcher';
import { AppJobRunner } from './infra/app-job-runner';
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
    MailModule,
    CurrencyModule,
    StorageModule,
    ObservabilityModule,
    PaymentModule,
    forwardRef(() => NotificationModule),
    forwardRef(() => ProductModule),
    forwardRef(() => OrderModule),
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
    AppJobRunner,
    RefreshExchangeRatesJob,
    SendWelcomeEmailJob,
    SendPasswordResetEmailJob,
    SendGuestOrderConfirmationEmailJob,
    SendRefundSucceededEmailJob,
    SendRefundFailedEmailJob,
    SendSellerOrderUpdateEmailJob,
    GenerateProductImageVariantsJob,
    GenerateReviewImageVariantsJob,
    ProjectCatalogProductJob,
    CleanupPendingReviewImageJob,
    CleanupExpiredCheckoutQuoteReservationsJob,
    RefreshBestSellerRankingsJob,
    {
      provide: JobDispatcher,
      inject: [QUEUE_CONFIG, BULLMQ_CONNECTION, AppJobRunner],
      useFactory: (
        queueConfig: QueueConfig,
        connection: Redis | null,
        appJobRunner: AppJobRunner,
      ) => {
        if (queueConfig.driver === 'redis') {
          if (!connection) {
            throw new Error(
              'Missing BullMQ Redis connection for redis queue driver',
            );
          }

          return new BullMqJobDispatcher(queueConfig, connection);
        }

        return new InlineJobDispatcher(appJobRunner);
      },
    },
  ],
  exports: [
    QUEUE_CONFIG,
    BULLMQ_CONNECTION,
    BULLMQ_QUEUE,
    JobDispatcher,
    AppJobRunner,
  ],
})
export class QueueModule {}
