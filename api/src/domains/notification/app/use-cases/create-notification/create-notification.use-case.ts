import { Injectable } from '@nestjs/common';
import { NotificationRepository } from '../../ports/notification.repository';
import type {
  CreateNotificationInput,
  NotificationSummary,
} from '../../notification.types';

@Injectable()
export class CreateNotificationUseCase {
  constructor(
    private readonly notificationRepository: NotificationRepository,
  ) {}

  async execute(input: CreateNotificationInput): Promise<NotificationSummary> {
    return this.notificationRepository.create({
      ...input,
      channel: input.channel ?? 'in_app',
    });
  }
}
