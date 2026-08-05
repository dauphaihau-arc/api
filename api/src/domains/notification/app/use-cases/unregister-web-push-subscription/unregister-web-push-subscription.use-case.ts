import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { WebPushSubscriptionRepository } from '../../ports/web-push-subscription.repository';

@Injectable()
export class UnregisterWebPushSubscriptionUseCase {
  constructor(
    private readonly webPushSubscriptionRepository: WebPushSubscriptionRepository,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    endpoint: string,
  ): Promise<boolean> {
    return this.webPushSubscriptionRepository.deactivateOwnedByEndpoint(
      actor.userId,
      endpoint,
    );
  }
}
