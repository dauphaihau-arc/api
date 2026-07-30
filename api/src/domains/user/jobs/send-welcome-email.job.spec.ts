import type { MailSender } from '~/integrations/mail/app/ports/mail-sender';
import { SendWelcomeEmailJob } from './send-welcome-email.job';

describe('SendWelcomeEmailJob', () => {
  it('sends a welcome message through the mail sender abstraction', async () => {
    const mailSender: jest.Mocked<MailSender> = {
      send: jest.fn().mockResolvedValue(undefined),
    };
    const job = new SendWelcomeEmailJob(mailSender);

    await job.run({
      userId: 'user-1',
      email: 'member@example.com',
      displayName: 'Member User',
    });

    expect(mailSender.send).toHaveBeenCalledTimes(1);
    expect(mailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: {
          email: 'member@example.com',
          name: 'Member User',
        },
        subject: 'Welcome',
        tags: ['user-created'],
      }),
    );
  });
});
