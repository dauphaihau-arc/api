import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { WebPushSubscriptionRepository } from '../../ports/web-push-subscription.repository';
import type { WebPushSubscriptionSummary } from '../../notification.types';

@Injectable()
export class RegisterWebPushSubscriptionUseCase {
  constructor(
    private readonly webPushSubscriptionRepository: WebPushSubscriptionRepository,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    input: {
      endpoint: string;
      p256dh: string;
      auth: string;
      userAgent?: string;
    },
  ): Promise<WebPushSubscriptionSummary> {
    return this.webPushSubscriptionRepository.upsert({
      userId: actor.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent,
    });
  }
}
