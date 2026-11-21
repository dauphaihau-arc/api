import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { BuyerLanguageService } from '~/domains/auth/app/services/buyer-language.service';
import {
  resolveOrderNotificationCopy,
} from '~/domains/order/app/outbound-messages/order-notifications.message';
import { NotificationRepository } from '../../ports/notification.repository';
import type {
  ListMyNotificationsQuery,
  NotificationListResult,
  NotificationSummary,
} from '../../notification.types';

@Injectable()
export class ListMyNotificationsUseCase {
  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly buyerLanguageService: BuyerLanguageService,
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

    const { isBuyer, language } = await this.buyerLanguageService.resolve(
      actor.userId,
    );

    return {
      results: isBuyer
        ? result.items.map((item) => this.localize(item, language))
        : result.items,
      page: query.page,
      limit: query.limit,
      totalPages: result.total === 0 ? 0 : Math.ceil(result.total / query.limit),
      totalResults: result.total,
    };
  }

  private localize(
    item: NotificationSummary,
    language: string,
  ): NotificationSummary {
    const { title, body } = resolveOrderNotificationCopy(
      language,
      item.type,
      item.data,
      { title: item.title, body: item.body },
    );

    return { ...item, title, body };
  }
}
