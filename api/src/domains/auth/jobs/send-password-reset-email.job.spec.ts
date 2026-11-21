import type { MailSender } from '~/integrations/mail/app/ports/mail-sender';
import type { BuyerLanguageService } from '~/domains/auth/app/services/buyer-language.service';
import { SendPasswordResetEmailJob } from './send-password-reset-email.job';

describe('SendPasswordResetEmailJob', () => {
  function buildJob(language: 'en' | 'vi') {
    const mailSender: jest.Mocked<MailSender> = {
      send: jest.fn().mockResolvedValue(undefined),
    };
    const buyerLanguageService = {
      resolve: jest.fn().mockResolvedValue({ isBuyer: true, language }),
    } as unknown as BuyerLanguageService;

    return {
      job: new SendPasswordResetEmailJob(mailSender, buyerLanguageService),
      mailSender,
      buyerLanguageService,
    };
  }

  const payload = {
    userId: 'user-1',
    email: 'member@example.com',
    displayName: 'Member User',
    resetUrl: 'https://example.com/reset-password?token=signed',
  };

  it('sends the Vietnamese reset message with the reset link to a Vietnamese buyer', async () => {
    const { job, mailSender, buyerLanguageService } = buildJob('vi');

    await job.run(payload);

    expect(buyerLanguageService.resolve).toHaveBeenCalledWith('user-1');
    expect(mailSender.send).toHaveBeenCalledTimes(1);
    expect(mailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: {
          email: 'member@example.com',
          name: 'Member User',
        },
        subject: 'Đặt lại mật khẩu của bạn',
        tags: ['password-reset'],
      }),
    );
    const message = mailSender.send.mock.calls[0][0];
    expect(message.text).toContain(payload.resetUrl);
    expect(message.text).toContain('Đặt lại mật khẩu');
    expect(message.html).toContain(`href="${payload.resetUrl}"`);
    expect(message.html).toContain('lang="vi"');
  });

  it('sends the English reset message to an English buyer', async () => {
    const { job, mailSender } = buildJob('en');

    await job.run(payload);

    expect(mailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Reset your password',
        tags: ['password-reset'],
      }),
    );
    const message = mailSender.send.mock.calls[0][0];
    expect(message.text).toContain(payload.resetUrl);
    expect(message.html).toContain(`href="${payload.resetUrl}"`);
    expect(message.html).toContain('lang="en"');
  });

  it('greets by email when the account has no display name', async () => {
    const { job, mailSender } = buildJob('en');

    await job.run({
      userId: 'user-1',
      email: 'member@example.com',
      resetUrl: payload.resetUrl,
    });

    const message = mailSender.send.mock.calls[0][0];
    expect(message.text).toContain('Hello member@example.com,');
    expect(mailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: { email: 'member@example.com', name: undefined },
      }),
    );
  });
});
