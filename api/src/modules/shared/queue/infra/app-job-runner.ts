import { Injectable, Logger } from '@nestjs/common';
import {
  appJobName,
  AppJobName,
  AppJobPayloadMap
} from '~/common/jobs/job.types';
import { RefreshExchangeRatesJob } from '~/common/jobs/refresh-exchange-rates.job';
import { GenerateProductImageVariantsJob } from '~/common/jobs/generate-product-image-variants.job';
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
  private readonly logger = new Logger(AppJobRunner.name);

  constructor(
    private readonly refreshExchangeRatesJob: RefreshExchangeRatesJob,
    private readonly sendWelcomeEmailJob: SendWelcomeEmailJob,
    private readonly sendPasswordResetEmailJob: SendPasswordResetEmailJob,
    private readonly sendGuestOrderConfirmationEmailJob: SendGuestOrderConfirmationEmailJob,
    private readonly processOrderRefundJob: ProcessOrderRefundJob,
    private readonly sendRefundSucceededEmailJob: SendRefundSucceededEmailJob,
    private readonly sendRefundFailedEmailJob: SendRefundFailedEmailJob,
    private readonly sendSellerOrderUpdateEmailJob: SendSellerOrderUpdateEmailJob,
    private readonly sendWebPushNotificationJob: SendWebPushNotificationJob,
    private readonly generateProductImageVariantsJob: GenerateProductImageVariantsJob
  ) {}

  async run<TName extends AppJobName>(
    name: TName,
    payload: AppJobPayloadMap[TName]
  ): Promise<void> {
    this.logger.log(`Running job ${name}`);
    this.logger.debug(`Job payload for ${name}: ${JSON.stringify(payload)}`);

    switch (name) {
      case appJobName.refreshExchangeRates:
        await this.refreshExchangeRatesJob.run();
        return;
      case appJobName.sendWelcomeEmail:
        await this.sendWelcomeEmailJob.run(
          payload as AppJobPayloadMap[typeof appJobName.sendWelcomeEmail]
        );
        return;
      case appJobName.sendPasswordResetEmail:
        await this.sendPasswordResetEmailJob.run(
          payload as AppJobPayloadMap[typeof appJobName.sendPasswordResetEmail]
        );
        return;
      case appJobName.sendGuestOrderConfirmationEmail:
        await this.sendGuestOrderConfirmationEmailJob.run(
          payload as AppJobPayloadMap[typeof appJobName.sendGuestOrderConfirmationEmail]
        );
        return;
      case appJobName.processOrderRefund:
        await this.processOrderRefundJob.run(
          payload as AppJobPayloadMap[typeof appJobName.processOrderRefund]
        );
        return;
      case appJobName.sendRefundSucceededEmail:
        await this.sendRefundSucceededEmailJob.run(
          payload as AppJobPayloadMap[typeof appJobName.sendRefundSucceededEmail]
        );
        return;
      case appJobName.sendRefundFailedEmail:
        await this.sendRefundFailedEmailJob.run(
          payload as AppJobPayloadMap[typeof appJobName.sendRefundFailedEmail]
        );
        return;
      case appJobName.sendSellerOrderUpdateEmail:
        await this.sendSellerOrderUpdateEmailJob.run(
          payload as AppJobPayloadMap[typeof appJobName.sendSellerOrderUpdateEmail]
        );
        return;
      case appJobName.sendWebPushNotification:
        await this.sendWebPushNotificationJob.run(
          payload as AppJobPayloadMap[typeof appJobName.sendWebPushNotification]
        );
        return;
      case appJobName.generateProductImageVariants:
        await this.generateProductImageVariantsJob.run(
          payload as AppJobPayloadMap[typeof appJobName.generateProductImageVariants]
        );
        return;
    }

    throw new Error(`Unsupported job name: ${String(name)}`);
  }
}
