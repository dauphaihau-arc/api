import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { CurrentUserEntity } from '~/modules/domains/auth/infra/persistence/entities/current-user.entity';
import { WebPushSubscriptionRepository } from '../app/ports/web-push-subscription.repository';
import type {
  RegisterWebPushSubscriptionInput,
  WebPushSubscriptionSummary
} from '../app/notification.types';
import { WebPushSubscriptionEntity } from './persistence/entities/web-push-subscription.entity';

@Injectable()
export class MikroOrmWebPushSubscriptionRepository
implements WebPushSubscriptionRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async upsert(
    input: RegisterWebPushSubscriptionInput
  ): Promise<WebPushSubscriptionSummary> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(WebPushSubscriptionEntity);
    const existing = await repository.findOne({ endpoint: input.endpoint });

    if (existing) {
      existing.user = entityManager.getReference(CurrentUserEntity, input.userId);
      existing.p256dh = input.p256dh;
      existing.auth = input.auth;
      existing.userAgent = input.userAgent;
      existing.isActive = true;
      await entityManager.persistAndFlush(existing);
      return this.toSummary(existing);
    }

    const subscription = repository.create({
      user: entityManager.getReference(CurrentUserEntity, input.userId),
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent,
      isActive: true,
    });

    await entityManager.persistAndFlush(subscription);

    return this.toSummary(subscription);
  }

  async deactivateOwnedByEndpoint(
    userId: string,
    endpoint: string
  ): Promise<boolean> {
    const updated = await this.entityManager.fork().nativeUpdate(
      WebPushSubscriptionEntity,
      { user: userId, endpoint, isActive: true },
      { isActive: false, updatedAt: new Date() }
    );

    return updated > 0;
  }

  async findActiveOwnedByUserId(
    userId: string
  ): Promise<WebPushSubscriptionSummary[]> {
    const subscriptions = await this.entityManager
      .fork()
      .getRepository(WebPushSubscriptionEntity)
      .find(
        { user: userId, isActive: true },
        {
          orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
        }
      );

    return subscriptions.map((subscription) => this.toSummary(subscription));
  }

  async markUsedById(id: string): Promise<void> {
    const now = new Date();
    await this.entityManager.fork().nativeUpdate(
      WebPushSubscriptionEntity,
      { id },
      { lastUsedAt: now, updatedAt: now }
    );
  }

  async deactivateById(id: string): Promise<void> {
    await this.entityManager.fork().nativeUpdate(
      WebPushSubscriptionEntity,
      { id },
      { isActive: false, updatedAt: new Date() }
    );
  }

  private toSummary(
    subscription: WebPushSubscriptionEntity
  ): WebPushSubscriptionSummary {
    return {
      id: subscription.id,
      userId: subscription.user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      userAgent: subscription.userAgent,
      isActive: subscription.isActive,
      lastUsedAt: subscription.lastUsedAt,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    };
  }
}
