import type { EntityManager } from '@mikro-orm/postgresql';
import type { MailSender } from '~/integrations/mail/app/ports/mail-sender';
import { SendRefundSucceededEmailJob } from './send-refund-succeeded-email.job';

describe('SendRefundSucceededEmailJob', () => {
  it('sends a buyer refund success email', async () => {
    const order = {
      id: 'order-1',
      customerEmail: 'buyer@example.com',
      currency: 'USD',
      total: 30,
      paymentDetails: { refund_amount: 25 },
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
    const job = new SendRefundSucceededEmailJob(entityManager, mailSender);

    await job.run({ orderId: 'order-1' });

    expect(mailSender.send).toHaveBeenCalledWith(expect.objectContaining({
      to: { email: 'buyer@example.com' },
      subject: 'Refund completed for order order-1',
      tags: ['order-refund-succeeded'],
      text: expect.stringContaining('25 USD'),
    }));
  });
});
