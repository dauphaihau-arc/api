import type { MailSender } from '~/integrations/mail/app/ports/mail-sender';
import { SendGuestOrderConfirmationEmailJob } from './send-guest-order-confirmation-email.job';

describe('SendGuestOrderConfirmationEmailJob', () => {
  function createJob() {
    const mailSender: jest.Mocked<MailSender> = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    return {
      mailSender,
      job: new SendGuestOrderConfirmationEmailJob(mailSender),
    };
  }

  const payload = {
    email: 'guest@example.com',
    orderIds: ['order-1', 'order-2'],
    trackingUrl: 'http://localhost:4001/guest-orders?token=signed-tracking-token',
    shopNames: ['Shop 1', 'Shop 2'],
  };

  it('sends an English guest confirmation with the order language', async () => {
    const { mailSender, job } = createJob();

    await job.run({ ...payload, language: 'en' });

    expect(mailSender.send).toHaveBeenCalledTimes(1);
    expect(mailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: { email: 'guest@example.com' },
        subject: 'Order confirmation: order-1, order-2',
        tags: ['guest-order-confirmation'],
        text: expect.stringContaining(
          'http://localhost:4001/guest-orders?token=signed-tracking-token',
        ),
        html: expect.stringContaining('lang="en"'),
      }),
    );
  });

  it('sends a Vietnamese guest confirmation with localized subject and link label', async () => {
    const { mailSender, job } = createJob();

    await job.run({ ...payload, language: 'vi' });

    const message = mailSender.send.mock.calls[0][0];

    expect(message.subject).toBe('Xác nhận đơn hàng: order-1, order-2');
    expect(message.text).toContain('Cảm ơn bạn đã đặt hàng từ Shop 1, Shop 2.');
    expect(message.text).toContain('Mã đơn hàng: order-1, order-2');
    expect(message.text).toContain('Theo dõi đơn hàng:');
    expect(message.html).toContain('lang="vi"');
    expect(message.html).toContain('Theo dõi đơn hàng');
  });
});
