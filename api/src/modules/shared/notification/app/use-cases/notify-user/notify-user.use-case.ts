import { Injectable, Logger } from '@nestjs/common';
import {
  appJobDeduplicationKey,
  appJobName
} from '~/common/jobs/job.types';
import { JobDispatcher } from '~/modules/shared/queue/app/ports/job-dispatcher';
import { NotificationRepository } from '../../ports/notification.repository';
import type { NotifyUserInput } from '../../notification.types';

@Injectable()
export class NotifyUserUseCase {
  private readonly logger = new Logger(NotifyUserUseCase.name);

  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly jobDispatcher: JobDispatcher
  ) {}

  async execute(input: NotifyUserInput): Promise<void> {
    const channels = input.channels ?? ['in_app'];
    const storedNotification = await this.notificationRepository.create({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data,
      channel: 'in_app',
    });

    if (!channels.includes('web_push')) {
      return;
    }

    try {
      await this.jobDispatcher.dispatch(
        appJobName.sendWebPushNotification,
        {
          userId: input.userId,
          notificationId: storedNotification.id,
          title: input.title,
          body: input.body,
          data: {
            type: input.type,
            ...(input.data ?? {}),
          },
        },
        {
          deduplicationKey: appJobDeduplicationKey.sendWebPushNotification(
            input.userId,
            storedNotification.id
          ),
        }
      );
    }
    catch (error) {
      this.logger.error(
        `Failed to queue Web Push notification ${storedNotification.id} for user ${input.userId}`,
        error instanceof Error ? error.stack : undefined
      );
    }
  }
}
