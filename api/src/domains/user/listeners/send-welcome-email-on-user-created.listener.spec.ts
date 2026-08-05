import { UserCreatedEvent } from '../events/user-created.event';
import { appJobDeduplicationKey } from '~/platform/jobs/app-job-deduplication';
import { appJobName } from '~/platform/jobs/app-job.names';
import type { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { SendWelcomeEmailOnUserCreatedListener } from './send-welcome-email-on-user-created.listener';

describe('SendWelcomeEmailOnUserCreatedListener', () => {
  it('enqueues a welcome email job with a deterministic deduplication key', async () => {
    const jobDispatcher: jest.Mocked<JobDispatcher> = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };
    const listener = new SendWelcomeEmailOnUserCreatedListener(jobDispatcher);

    await listener.handle(
      new UserCreatedEvent('user-1', 'member@example.com', 'Member User'),
    );

    expect(jobDispatcher.dispatch).toHaveBeenCalledTimes(1);
    expect(jobDispatcher.dispatch).toHaveBeenCalledWith(
      appJobName.sendWelcomeEmail,
      {
        userId: 'user-1',
        email: 'member@example.com',
        displayName: 'Member User',
      },
      {
        deduplicationKey: appJobDeduplicationKey.sendWelcomeEmail('user-1'),
      },
    );
  });
});
