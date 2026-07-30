import { Inject, Injectable, Logger } from '@nestjs/common';
import * as webPush from 'web-push';
import {
  WEB_PUSH_CONFIG,
  type WebPushConfig,
} from '~/platform/config/web-push.config';
import { WebPushSender } from '../app/ports/web-push-sender';
import type { WebPushSubscriptionSummary } from '../app/notification.types';
import { WebPushDeliveryError } from './web-push.errors';

@Injectable()
export class VapidWebPushSender implements WebPushSender {
  private readonly logger = new Logger(VapidWebPushSender.name);
  private readonly webPush = webPush;

  constructor(
    @Inject(WEB_PUSH_CONFIG) private readonly webPushConfig: WebPushConfig,
  ) {
    if (this.webPushConfig.enabled) {
      this.webPush.setVapidDetails(
        this.webPushConfig.subject!,
        this.webPushConfig.publicKey!,
        this.webPushConfig.privateKey!,
      );
    }
  }

  async send(input: {
    subscription: WebPushSubscriptionSummary;
    notification: {
      id: string;
      title: string;
      body: string;
      data?: Record<string, unknown>;
    };
  }): Promise<void> {
    if (!this.webPushConfig.enabled) {
      this.logger.warn(
        'Skipping Web Push delivery because VAPID config is not enabled',
      );
      return;
    }

    try {
      await this.webPush.sendNotification(
        {
          endpoint: input.subscription.endpoint,
          keys: {
            p256dh: input.subscription.p256dh,
            auth: input.subscription.auth,
          },
        },
        JSON.stringify({
          title: input.notification.title,
          body: input.notification.body,
          data: {
            notificationId: input.notification.id,
            ...(input.notification.data ?? {}),
          },
        }),
        {
          TTL: this.webPushConfig.ttlSeconds,
        },
      );
    }
    catch (error) {
      const statusCode = (
        typeof error === 'object'
        && error !== null
        && 'statusCode' in error
        && typeof error.statusCode === 'number'
      )
        ? Number(error.statusCode)
        : undefined;

      throw new WebPushDeliveryError(
        error instanceof Error ? error.message : 'Unknown Web Push error',
        statusCode,
      );
    }
  }
}
