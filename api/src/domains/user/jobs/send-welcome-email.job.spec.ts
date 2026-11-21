import type { MailSender } from '~/integrations/mail/app/ports/mail-sender';
import type { AccountEmailLanguageService } from '~/domains/auth/app/services/account-email-language.service';
import { SendWelcomeEmailJob } from './send-welcome-email.job';

describe('SendWelcomeEmailJob', () => {
  function buildJob(language: 'en' | 'vi') {
    const mailSender: jest.Mocked<MailSender> = {
      send: jest.fn().mockResolvedValue(undefined),
    };
    const accountEmailLanguageService = {
      resolve: jest.fn().mockResolvedValue(language),
    } as unknown as AccountEmailLanguageService;

    return {
      job: new SendWelcomeEmailJob(mailSender, accountEmailLanguageService),
      mailSender,
      accountEmailLanguageService,
    };
  }

  it('sends the Vietnamese welcome message to a Vietnamese buyer', async () => {
    const { job, mailSender, accountEmailLanguageService } = buildJob('vi');

    await job.run({
      userId: 'user-1',
      email: 'member@example.com',
      displayName: 'Member User',
    });

    expect(accountEmailLanguageService.resolve).toHaveBeenCalledWith('user-1');
    expect(mailSender.send).toHaveBeenCalledTimes(1);
    expect(mailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: {
          email: 'member@example.com',
          name: 'Member User',
        },
        subject: 'Chào mừng',
        tags: ['user-created'],
      }),
    );
    const payload = mailSender.send.mock.calls[0][0];
    expect(payload.text).toContain('Xin chào Member User, tài khoản của bạn đã được tạo.');
    expect(payload.html).toContain('lang="vi"');
  });

  it('sends the English welcome message to an English buyer', async () => {
    const { job, mailSender } = buildJob('en');

    await job.run({
      userId: 'user-1',
      email: 'member@example.com',
      displayName: 'Member User',
    });

    expect(mailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Welcome',
        tags: ['user-created'],
      }),
    );
    const payload = mailSender.send.mock.calls[0][0];
    expect(payload.text).toContain('Hello Member User, your account was created.');
    expect(payload.html).toContain('lang="en"');
  });

  it('greets by email when the account has no display name', async () => {
    const { job, mailSender } = buildJob('en');

    await job.run({
      userId: 'user-1',
      email: 'member@example.com',
    });

    const payload = mailSender.send.mock.calls[0][0];
    expect(payload.text).toContain('Hello member@example.com, your account was created.');
    expect(mailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: { email: 'member@example.com', name: undefined },
      }),
    );
  });
});
