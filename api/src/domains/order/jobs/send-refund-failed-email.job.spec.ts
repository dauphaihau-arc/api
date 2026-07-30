import type { EntityManager } from '@mikro-orm/postgresql';
import type { MailSender } from '~/integrations/mail/app/ports/mail-sender';
import { SendRefundFailedEmailJob } from './send-refund-failed-email.job';

describe('SendRefundFailedEmailJob', () => {
  it('sends a buyer refund failure email', async () => {
    const order = {
      id: 'order-1',
      customerEmail: 'buyer@example.com',
      paymentDetails: { refund_failed_reason: 'Stripe timeout' },
      shop: { shopName: 'Shop 1' },
    };
    const entityManager = {
      fork: jest.fn(() => ({
        getRepository: jest.fn(() => ({
          findOne: jest.fn().mockResolvedValue(order),
        })),
      })),
    } as unknown as EntityManager;
    const mailSender: jest.Mocked<MailSender> = {
      send: jest.fn().mockResolvedValue(undefined),
    };
    const job = new SendRefundFailedEmailJob(entityManager, mailSender);

    await job.run({ orderId: 'order-1' });

    expect(mailSender.send).toHaveBeenCalledWith(expect.objectContaining({
      to: { email: 'buyer@example.com' },
      subject: 'Refund update for order order-1',
      tags: ['order-refund-failed'],
      text: expect.stringContaining('Stripe timeout'),
    }));
  });
});
