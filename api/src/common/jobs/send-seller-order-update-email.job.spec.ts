import type { EntityManager } from '@mikro-orm/postgresql';
import type { MailSender } from '../../modules/shared/mail/app/ports/mail-sender';
import { SendSellerOrderUpdateEmailJob } from './send-seller-order-update-email.job';

describe('SendSellerOrderUpdateEmailJob', () => {
  it('sends a seller cancellation email', async () => {
    const order = {
      id: 'order-1',
      customerEmail: 'buyer@example.com',
      shop: {
        shopName: 'Shop 1',
        ownerUser: {
          email: 'seller@example.com',
          displayName: 'Seller One',
        },
      },
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
    const job = new SendSellerOrderUpdateEmailJob(entityManager, mailSender);

    await job.run({ orderId: 'order-1', eventType: 'canceled' });

    expect(mailSender.send).toHaveBeenCalledWith(expect.objectContaining({
      to: { email: 'seller@example.com', name: 'Seller One' },
      subject: 'Order order-1 was canceled',
      tags: ['order-canceled', 'seller-order-update'],
    }));
  });
});
