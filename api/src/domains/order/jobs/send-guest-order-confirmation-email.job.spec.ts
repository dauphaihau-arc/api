import type { MailSender } from '~/integrations/mail/app/ports/mail-sender';
import { SendGuestOrderConfirmationEmailJob } from './send-guest-order-confirmation-email.job';

describe('SendGuestOrderConfirmationEmailJob', () => {
  it('sends a guest confirmation email with a direct tracking link', async () => {
    const mailSender: jest.Mocked<MailSender> = {
      send: jest.fn().mockResolvedValue(undefined),
    };
    const job = new SendGuestOrderConfirmationEmailJob(mailSender);

    await job.run({
      email: 'guest@example.com',
      orderIds: ['order-1', 'order-2'],
      trackingUrl: 'http://localhost:4000/guest-orders?token=signed-tracking-token',
      shopNames: ['Shop 1', 'Shop 2'],
    });

    expect(mailSender.send).toHaveBeenCalledTimes(1);
    expect(mailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: { email: 'guest@example.com' },
        subject: 'Your guest order confirmation',
        tags: ['guest-order-confirmation'],
        text: expect.stringContaining('http://localhost:4000/guest-orders?token=signed-tracking-token'),
      }),
    );
  });
});
