import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { CurrentUserEntity } from '~/modules/domains/auth/infra/persistence/entities/current-user.entity';
import { NotificationCommandRepository } from '../app/ports/notification-command.repository';
import type {
  CreateNotificationInput,
  NotificationSummary,
} from '../app/notification.types';
import { NotificationEntity } from './persistence/entities/notification.entity';
import { toNotificationSummary } from './notification-summary.mapper';

@Injectable()
export class MikroOrmNotificationCommandRepository implements NotificationCommandRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async create(input: CreateNotificationInput): Promise<NotificationSummary> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(NotificationEntity);
    const notification = repository.create({
      user: entityManager.getReference(CurrentUserEntity, input.userId),
      type: input.type,
      channel: input.channel ?? 'in_app',
      title: input.title,
      body: input.body,
      data: input.data,
    });

    await entityManager.persistAndFlush(notification);

    return toNotificationSummary(notification);
  }

  async markOwnedByIdAsRead(
    userId: string,
    notificationId: string,
  ): Promise<NotificationSummary | null> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(NotificationEntity);
    const notification = await repository.findOne({
      id: notificationId,
      user: userId,
    });

    if (!notification) {
      return null;
    }

    if (!notification.readAt) {
      notification.readAt = new Date();
      await entityManager.persistAndFlush(notification);
    }

    return toNotificationSummary(notification);
  }

  async markAllOwnedByUserIdAsRead(userId: string): Promise<number> {
    const now = new Date();
    return this.entityManager.fork().nativeUpdate(
      NotificationEntity,
      { user: userId, readAt: null },
      { readAt: now, updatedAt: now },
    );
  }
}
