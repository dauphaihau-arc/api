import type { EntityManager } from '@mikro-orm/postgresql';
import type { MailSender } from '~/integrations/mail/app/ports/mail-sender';
import { SendRefundSucceededEmailJob } from './send-refund-succeeded-email.job';

describe('SendRefundSucceededEmailJob', () => {
  function createJob(order: Record<string, unknown>) {
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

    return {
      mailSender,
      job: new SendRefundSucceededEmailJob(entityManager, mailSender),
    };
  }

  const baseOrder = {
    id: 'order-1',
    publicId: 'ord_public1',
    customerEmail: 'buyer@example.com',
    shop: { shopName: 'Shop 1' },
  };

  it('sends an English refund-success email with localized USD formatting', async () => {
    const { mailSender, job } = createJob({
      ...baseOrder,
      language: 'en',
      currency: 'USD',
      total: 30,
      paymentDetails: { refund_amount: 25 },
    });

    await job.run({ orderId: 'order-1' });

    expect(mailSender.send).toHaveBeenCalledTimes(1);
    expect(mailSender.send).toHaveBeenCalledWith(expect.objectContaining({
      to: { email: 'buyer@example.com' },
      subject: 'Refund completed for order ord_public1',
      tags: ['order-refund-succeeded'],
      text: expect.stringContaining('Refund amount: $25.00'),
      html: expect.stringContaining('lang="en"'),
    }));
  });

  it('sends a Vietnamese refund-success email with localized VND formatting', async () => {
    const { mailSender, job } = createJob({
      ...baseOrder,
      language: 'vi',
      currency: 'VND',
      total: 250000,
      paymentDetails: {},
    });

    await job.run({ orderId: 'order-1' });

    const message = mailSender.send.mock.calls[0][0];
    expect(message.subject).toBe('Đã hoàn tiền cho đơn hàng ord_public1');
    expect(message.text).toContain('Số tiền hoàn:');
    expect(message.text).toMatch(/250\.000\s₫/u);
    expect(message.html).toContain('lang="vi"');
    expect(message.html).toMatch(/250\.000\s₫/u);
  });

  it('falls back to total when the refund amount is not numeric', async () => {
    const { mailSender, job } = createJob({
      ...baseOrder,
      language: 'en',
      currency: 'USD',
      total: 30,
      paymentDetails: { refund_amount: '25' },
    });

    await job.run({ orderId: 'order-1' });

    const message = mailSender.send.mock.calls[0][0];
    expect(message.text).toContain('Refund amount: $30.00');
  });
});
