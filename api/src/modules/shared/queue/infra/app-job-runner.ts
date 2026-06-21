import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { captureException } from '~/common/sentry/sentry';
import { getAppTracer, setSpanError } from '../../observability/tracing';
import {
  appJobName,
  AppJobName,
  AppJobPayloadMap,
} from '~/common/jobs/job.types';
import { RefreshExchangeRatesJob } from '~/common/jobs/refresh-exchange-rates.job';
import { GenerateProductImageVariantsJob } from '~/common/jobs/generate-product-image-variants.job';
import { GenerateReviewImageVariantsJob } from '~/common/jobs/generate-review-image-variants.job';
import { ProjectCatalogProductJob } from '~/common/jobs/project-catalog-product.job';
import { CleanupPendingReviewImageJob } from '~/common/jobs/cleanup-pending-review-image.job';
import { ProcessOrderRefundJob } from '~/common/jobs/process-order-refund.job';
import { SendGuestOrderConfirmationEmailJob } from '~/common/jobs/send-guest-order-confirmation-email.job';
import { SendPasswordResetEmailJob } from '~/common/jobs/send-password-reset-email.job';
import { SendRefundFailedEmailJob } from '~/common/jobs/send-refund-failed-email.job';
import { SendRefundSucceededEmailJob } from '~/common/jobs/send-refund-succeeded-email.job';
import { SendSellerOrderUpdateEmailJob } from '~/common/jobs/send-seller-order-update-email.job';
import { SendWebPushNotificationJob } from '~/common/jobs/send-web-push-notification.job';
import { SendWelcomeEmailJob } from '~/common/jobs/send-welcome-email.job';

@Injectable()
export class AppJobRunner {
  private readonly tracer = getAppTracer();

  constructor(
    @InjectPinoLogger(AppJobRunner.name)
    private readonly logger: PinoLogger,
    private readonly refreshExchangeRatesJob: RefreshExchangeRatesJob,
    private readonly sendWelcomeEmailJob: SendWelcomeEmailJob,
    private readonly sendPasswordResetEmailJob: SendPasswordResetEmailJob,
    private readonly sendGuestOrderConfirmationEmailJob: SendGuestOrderConfirmationEmailJob,
    private readonly processOrderRefundJob: ProcessOrderRefundJob,
    private readonly sendRefundSucceededEmailJob: SendRefundSucceededEmailJob,
    private readonly sendRefundFailedEmailJob: SendRefundFailedEmailJob,
    private readonly sendSellerOrderUpdateEmailJob: SendSellerOrderUpdateEmailJob,
    private readonly sendWebPushNotificationJob: SendWebPushNotificationJob,
    private readonly generateProductImageVariantsJob: GenerateProductImageVariantsJob,
    private readonly generateReviewImageVariantsJob: GenerateReviewImageVariantsJob,
    private readonly projectCatalogProductJob: ProjectCatalogProductJob,
    private readonly cleanupPendingReviewImageJob: CleanupPendingReviewImageJob,
  ) {}

  async run<TName extends AppJobName>(
    name: TName,
    payload: AppJobPayloadMap[TName],
  ): Promise<void> {
    return this.tracer.startActiveSpan(`queue.job ${name}`, {
      attributes: {
        'app.job.name': name,
      },
    }, async (span) => {
      this.logger.info({
        context: AppJobRunner.name,
        event: 'queue.job.started',
        jobName: name,
        payload,
      }, 'Running job');

      try {
        switch (name) {
          case appJobName.refreshExchangeRates:
            await this.refreshExchangeRatesJob.run();
            return;
          case appJobName.sendWelcomeEmail:
            await this.sendWelcomeEmailJob.run(
              payload as AppJobPayloadMap[typeof appJobName.sendWelcomeEmail],
            );
            return;
          case appJobName.sendPasswordResetEmail:
            await this.sendPasswordResetEmailJob.run(
              payload as AppJobPayloadMap[typeof appJobName.sendPasswordResetEmail],
            );
            return;
          case appJobName.sendGuestOrderConfirmationEmail:
            await this.sendGuestOrderConfirmationEmailJob.run(
              payload as AppJobPayloadMap[typeof appJobName.sendGuestOrderConfirmationEmail],
            );
            return;
          case appJobName.processOrderRefund:
            await this.processOrderRefundJob.run(
              payload as AppJobPayloadMap[typeof appJobName.processOrderRefund],
            );
            return;
          case appJobName.sendRefundSucceededEmail:
            await this.sendRefundSucceededEmailJob.run(
              payload as AppJobPayloadMap[typeof appJobName.sendRefundSucceededEmail],
            );
            return;
          case appJobName.sendRefundFailedEmail:
            await this.sendRefundFailedEmailJob.run(
              payload as AppJobPayloadMap[typeof appJobName.sendRefundFailedEmail],
            );
            return;
          case appJobName.sendSellerOrderUpdateEmail:
            await this.sendSellerOrderUpdateEmailJob.run(
              payload as AppJobPayloadMap[typeof appJobName.sendSellerOrderUpdateEmail],
            );
            return;
          case appJobName.sendWebPushNotification:
            await this.sendWebPushNotificationJob.run(
              payload as AppJobPayloadMap[typeof appJobName.sendWebPushNotification],
            );
            return;
          case appJobName.generateProductImageVariants:
            await this.generateProductImageVariantsJob.run(
              payload as AppJobPayloadMap[typeof appJobName.generateProductImageVariants],
            );
            return;
          case appJobName.generateReviewImageVariants:
            await this.generateReviewImageVariantsJob.run(
              payload as AppJobPayloadMap[typeof appJobName.generateReviewImageVariants],
            );
            return;
          case appJobName.projectCatalogProduct:
            await this.projectCatalogProductJob.run(
              payload as AppJobPayloadMap[typeof appJobName.projectCatalogProduct],
            );
            return;
          case appJobName.cleanupPendingReviewImage:
            await this.cleanupPendingReviewImageJob.run(
              payload as AppJobPayloadMap[typeof appJobName.cleanupPendingReviewImage],
            );
            return;
        }

        throw new Error(`Unsupported job name: ${String(name)}`);
      }
      catch (error) {
        setSpanError(span, error);
        this.logger.error({
          context: AppJobRunner.name,
          err: error instanceof Error ? error : undefined,
          event: 'queue.job.failed',
          jobName: String(name),
          payload,
        }, 'Queue job failed');
        captureException(error, (scope) => {
          scope.setTag('runtime', 'worker');
          scope.setTag('job.name', String(name));
          scope.setContext('job', {
            name: String(name),
          });
        });
        throw error;
      }
      finally {
        span.end();
      }
    });
  }
}
