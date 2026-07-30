import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { appJobDeduplicationKey, appJobName } from '~/integrations/queue/app/app-job.types';
import { UserCreatedEvent } from '../events/user-created.event';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';

@Injectable()
export class SendWelcomeEmailOnUserCreatedListener {
  private readonly logger = new Logger(
    SendWelcomeEmailOnUserCreatedListener.name,
  );

  constructor(private readonly jobDispatcher: JobDispatcher) {}

  @OnEvent('user.created', { async: true, suppressErrors: true })
  async handle(event: UserCreatedEvent): Promise<void> {
    await this.jobDispatcher.dispatch(
      appJobName.sendWelcomeEmail,
      {
        userId: event.userId,
        email: event.email,
        displayName: event.displayName,
      },
      {
        deduplicationKey: appJobDeduplicationKey.sendWelcomeEmail(event.userId),
      },
    );

    this.logger.log(`Queued welcome email for ${event.email}`);
  }
}
