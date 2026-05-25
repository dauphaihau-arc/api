import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { CurrentUserEntity } from '~/modules/domains/auth/infra/persistence/entities/current-user.entity';
import { NotificationRepository } from '../app/ports/notification.repository';
import type {
  CreateNotificationInput,
  NotificationListRepositoryResult,
  NotificationSummary
} from '../app/notification.types';
import { NotificationEntity } from './persistence/entities/notification.entity';

@Injectable()
export class MikroOrmNotificationRepository implements NotificationRepository {
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

    return this.toSummary(notification);
  }

  async findAllOwnedByUserId(
    userId: string,
    page: number,
    limit: number
  ): Promise<NotificationListRepositoryResult> {
    const repository = this.entityManager.fork().getRepository(NotificationEntity);
    const [notifications, total] = await repository.findAndCount(
      { user: userId },
      {
        offset: (page - 1) * limit,
        limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }
    );

    return {
      items: notifications.map((notification) => this.toSummary(notification)),
      total,
    };
  }

  countUnreadOwnedByUserId(userId: string): Promise<number> {
    return this.entityManager
      .fork()
      .getRepository(NotificationEntity)
      .count({ user: userId, readAt: null });
  }

  async markOwnedByIdAsRead(
    userId: string,
    notificationId: string
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

    return this.toSummary(notification);
  }

  async markAllOwnedByUserIdAsRead(userId: string): Promise<number> {
    const now = new Date();
    const result = await this.entityManager.fork().nativeUpdate(
      NotificationEntity,
      { user: userId, readAt: null },
      { readAt: now, updatedAt: now }
    );

    return result;
  }

  private toSummary(notification: NotificationEntity): NotificationSummary {
    return {
      id: notification.id,
      userId: notification.user.id,
      type: notification.type,
      channel: notification.channel,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    };
  }
}
