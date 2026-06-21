import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { NotificationRepository } from '../../ports/notification.repository';
import type {
  ListMyNotificationsQuery,
  NotificationListResult,
} from '../../notification.types';

@Injectable()
export class ListMyNotificationsUseCase {
  constructor(
    private readonly notificationRepository: NotificationRepository,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    query: ListMyNotificationsQuery,
  ): Promise<NotificationListResult> {
    const result = await this.notificationRepository.findAllOwnedByUserId(
      actor.userId,
      query.page,
      query.limit,
    );

    return {
      results: result.items,
      page: query.page,
      limit: query.limit,
      totalPages: result.total === 0 ? 0 : Math.ceil(result.total / query.limit),
      totalResults: result.total,
    };
  }
}
