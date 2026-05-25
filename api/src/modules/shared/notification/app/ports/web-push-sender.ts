import type { WebPushSubscriptionSummary } from '../notification.types';

export abstract class WebPushSender {
  abstract send(input: {
    subscription: WebPushSubscriptionSummary;
    notification: {
      id: string;
      title: string;
      body: string;
      data?: Record<string, unknown>;
    };
  }): Promise<void>;
}
