import { Injectable, Logger } from '@nestjs/common';
import type { AppJobPayloadMap } from '~/integrations/queue/app/app-job.types';
import { WebPushSender } from '~/integrations/notification/app/ports/web-push-sender';
import { WebPushSubscriptionRepository } from '~/integrations/notification/app/ports/web-push-subscription.repository';
import { isWebPushSubscriptionGoneError } from '~/integrations/notification/infra/web-push.errors';

type SendWebPushNotificationPayload =
  AppJobPayloadMap['notification.send-web-push'];

@Injectable()
export class SendWebPushNotificationJob {
  private readonly logger = new Logger(SendWebPushNotificationJob.name);

  constructor(
    private readonly webPushSubscriptionRepository: WebPushSubscriptionRepository,
    private readonly webPushSender: WebPushSender,
  ) {}

  async run(payload: SendWebPushNotificationPayload): Promise<void> {
    const subscriptions =
      await this.webPushSubscriptionRepository.findActiveOwnedByUserId(
        payload.userId,
      );

    for (const subscription of subscriptions) {
      try {
        await this.webPushSender.send({
          subscription,
          notification: {
            id: payload.notificationId,
            title: payload.title,
            body: payload.body,
            data: payload.data,
          },
        });
        await this.webPushSubscriptionRepository.markUsedById(subscription.id);
      }
      catch (error) {
        if (isWebPushSubscriptionGoneError(error)) {
          await this.webPushSubscriptionRepository.deactivateById(
            subscription.id,
          );
          this.logger.warn(
            `Deactivated expired Web Push subscription ${subscription.id}`,
          );
          continue;
        }

        throw error;
      }
    }
  }
}
