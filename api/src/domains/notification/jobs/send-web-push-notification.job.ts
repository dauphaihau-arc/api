import { Injectable, Logger } from '@nestjs/common';
import type { AppJobPayloadMap } from '~/platform/jobs/app-job.types';
import { BuyerLanguageService } from '~/domains/auth/app/services/buyer-language.service';
import {
  resolveOrderNotificationCopy,
} from '~/domains/order/app/outbound-messages/order-notifications.message';
import { WebPushSender } from '~/domains/notification/app/ports/web-push-sender';
import { WebPushSubscriptionRepository } from '~/domains/notification/app/ports/web-push-subscription.repository';
import { isWebPushSubscriptionGoneError } from '~/domains/notification/infra/web-push.errors';

type SendWebPushNotificationPayload =
  AppJobPayloadMap['notification.send-web-push'];

@Injectable()
export class SendWebPushNotificationJob {
  private readonly logger = new Logger(SendWebPushNotificationJob.name);

  constructor(
    private readonly webPushSubscriptionRepository: WebPushSubscriptionRepository,
    private readonly webPushSender: WebPushSender,
    private readonly buyerLanguageService: BuyerLanguageService,
  ) {}

  async run(payload: SendWebPushNotificationPayload): Promise<void> {
    const subscriptions =
      await this.webPushSubscriptionRepository.findActiveOwnedByUserId(
        payload.userId,
      );

    const { title, body } = await this.resolveNotificationCopy(payload);

    for (const subscription of subscriptions) {
      try {
        await this.webPushSender.send({
          subscription,
          notification: {
            id: payload.notificationId,
            title,
            body,
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

  /**
   * Resolves copy once per run so a language preference change takes effect
   * before the next dispatch. Buyers get the order copy in their language;
   * everyone else, and any unresolvable message, keeps the stored English
   * payload written when the notification was created.
   */
  private async resolveNotificationCopy(
    payload: SendWebPushNotificationPayload,
  ): Promise<{ title: string; body: string }> {
    const stored = { title: payload.title, body: payload.body };
    const { isBuyer, language } = await this.buyerLanguageService.resolve(
      payload.userId,
    );
    const type = payload.data?.type;

    if (!isBuyer || typeof type !== 'string') {
      return stored;
    }

    return resolveOrderNotificationCopy(language, type, payload.data, stored);
  }
}
