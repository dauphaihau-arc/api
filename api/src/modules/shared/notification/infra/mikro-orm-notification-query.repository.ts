import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { NotificationQueryRepository } from '../app/ports/notification-query.repository';
import type { NotificationListRepositoryResult } from '../app/notification.types';
import { NotificationEntity } from './persistence/entities/notification.entity';
import { toNotificationSummary } from './notification-summary.mapper';

@Injectable()
export class MikroOrmNotificationQueryRepository implements NotificationQueryRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findAllOwnedByUserId(
    userId: string,
    page: number,
    limit: number,
  ): Promise<NotificationListRepositoryResult> {
    const repository = this.entityManager.fork().getRepository(NotificationEntity);
    const [notifications, total] = await repository.findAndCount(
      { user: userId },
      {
        offset: (page - 1) * limit,
        limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      },
    );

    return {
      items: notifications.map(toNotificationSummary),
      total,
    };
  }

  countUnreadOwnedByUserId(userId: string): Promise<number> {
    return this.entityManager
      .fork()
      .getRepository(NotificationEntity)
      .count({ user: userId, readAt: null });
  }
}
