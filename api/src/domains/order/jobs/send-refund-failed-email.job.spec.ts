import type { EntityManager } from '@mikro-orm/postgresql';
import { Logger } from '@nestjs/common';
import type { MailSender } from '~/integrations/mail/app/ports/mail-sender';
import { SendRefundFailedEmailJob } from './send-refund-failed-email.job';

describe('SendRefundFailedEmailJob', () => {
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
      job: new SendRefundFailedEmailJob(entityManager, mailSender),
    };
  }

  const baseOrder = {
    id: 'order-1',
    publicId: 'ord_public1',
    customerEmail: 'buyer@example.com',
    shop: { shopName: 'Shop 1' },
  };

  it('sends safe English copy and logs the raw provider reason for diagnostics', async () => {
    const rawReason = 'Stripe timeout from private provider diagnostics';
    const { mailSender, job } = createJob({
      ...baseOrder,
      language: 'en',
      paymentDetails: { refund_failed_reason: rawReason },
    });
    const loggerWarning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    try {
      await job.run({ orderId: 'order-1' });

      const message = mailSender.send.mock.calls[0][0];
      expect(message.subject).toBe('Refund update for order ord_public1');
      expect(message.text).toContain('Our support team will review it');
      expect(message.html).toContain('lang="en"');
      expect(JSON.stringify(message)).not.toContain(rawReason);
      expect(loggerWarning).toHaveBeenCalledWith(
        expect.stringContaining('order-1'),
      );
      expect(loggerWarning).toHaveBeenCalledWith(
        expect.stringContaining(rawReason),
      );
    }
    finally {
      loggerWarning.mockRestore();
    }
  });

  it('sends safe Vietnamese copy without exposing the raw provider reason', async () => {
    const rawReason = 'Gateway: invalid auth token';
    const { mailSender, job } = createJob({
      ...baseOrder,
      language: 'vi',
      paymentDetails: { refund_failed_reason: rawReason },
    });
    const loggerWarning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    try {
      await job.run({ orderId: 'order-1' });

      const message = mailSender.send.mock.calls[0][0];
      expect(message.subject).toBe('Cập nhật hoàn tiền cho đơn hàng ord_public1');
      expect(message.text).toContain('Đội ngũ hỗ trợ của chúng tôi');
      expect(message.html).toContain('lang="vi"');
      expect(message.html).not.toContain('Our support team');
      expect(JSON.stringify(message)).not.toContain(rawReason);
      expect(loggerWarning).toHaveBeenCalledWith(
        expect.stringContaining(`order-1: ${rawReason}`),
      );
    }
    finally {
      loggerWarning.mockRestore();
    }
  });
});
