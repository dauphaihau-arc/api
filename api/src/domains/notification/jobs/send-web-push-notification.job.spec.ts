import type { BuyerLanguageService } from '~/domains/auth/app/services/buyer-language.service';
import type { WebPushSender } from '~/domains/notification/app/ports/web-push-sender';
import type { WebPushSubscriptionRepository } from '~/domains/notification/app/ports/web-push-subscription.repository';
import type { WebPushSubscriptionSummary } from '~/domains/notification/app/notification.types';
import { WebPushDeliveryError } from '~/domains/notification/infra/web-push.errors';
import type { AppJobPayloadMap } from '~/platform/jobs/app-job.types';
import { SendWebPushNotificationJob } from './send-web-push-notification.job';

type Payload = AppJobPayloadMap['notification.send-web-push'];

const SUBSCRIPTION: WebPushSubscriptionSummary = {
  id: 'subscription-1',
  userId: 'user-1',
  endpoint: 'https://push.example.com/1',
  p256dh: 'p256dh',
  auth: 'auth',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const DATA = {
  type: 'order.canceled',
  orderNumber: 'ORD-1001',
  orderId: 'order-1',
};

describe('SendWebPushNotificationJob', () => {
  function buildPayload(overrides: Partial<Payload> = {}): Payload {
    return {
      userId: 'user-1',
      notificationId: 'notification-1',
      title: 'Order canceled',
      body: 'Order ORD-1001 was canceled.',
      data: DATA,
      ...overrides,
    };
  }

  function buildSubscriptionRepository(
    subscriptions: WebPushSubscriptionSummary[] = [SUBSCRIPTION],
  ): jest.Mocked<WebPushSubscriptionRepository> {
    return {
      upsert: jest.fn(),
      deactivateOwnedByEndpoint: jest.fn(),
      findActiveOwnedByUserId: jest.fn().mockResolvedValue(subscriptions),
      markUsedById: jest.fn().mockResolvedValue(undefined),
      deactivateById: jest.fn().mockResolvedValue(undefined),
    };
  }

  function buildSender(): jest.Mocked<WebPushSender> {
    return {
      send: jest.fn().mockResolvedValue(undefined),
    };
  }

  function buildBuyerLanguageService(
    result: { isBuyer: boolean; language: 'en' | 'vi' } = {
      isBuyer: true,
      language: 'en',
    },
  ): jest.Mocked<Pick<BuyerLanguageService, 'resolve'>> {
    return {
      resolve: jest.fn().mockResolvedValue(result),
    };
  }

  function buildJob(
    repository: jest.Mocked<WebPushSubscriptionRepository>,
    sender: jest.Mocked<WebPushSender>,
    buyerLanguageService: jest.Mocked<Pick<BuyerLanguageService, 'resolve'>>,
  ): SendWebPushNotificationJob {
    return new SendWebPushNotificationJob(
      repository,
      sender,
      buyerLanguageService as unknown as BuyerLanguageService,
    );
  }

  it.each([
    [
      'order.canceled',
      'Đơn hàng đã hủy',
      'Đơn hàng ORD-1001 đã bị hủy.',
    ],
    [
      'order.fulfillment.updated',
      'Đơn hàng đã cập nhật',
      'Đơn hàng ORD-1001 đã được cập nhật.',
    ],
    [
      'order.shipment.updated',
      'Vận chuyển đã cập nhật',
      'Thông tin vận chuyển của đơn hàng ORD-1001 đã được cập nhật.',
    ],
  ])('localizes %s for a Vietnamese buyer', async (type, title, body) => {
    const repository = buildSubscriptionRepository();
    const sender = buildSender();
    const buyerLanguageService = buildBuyerLanguageService({
      isBuyer: true,
      language: 'vi',
    });
    const job = buildJob(repository, sender, buyerLanguageService);
    const data = { ...DATA, type };

    await job.run(buildPayload({ data }));

    expect(sender.send).toHaveBeenCalledWith({
      subscription: SUBSCRIPTION,
      notification: {
        id: 'notification-1',
        title,
        body,
        data,
      },
    });
  });

  it('uses English catalog copy for an English buyer', async () => {
    const repository = buildSubscriptionRepository();
    const sender = buildSender();
    const job = buildJob(
      repository,
      sender,
      buildBuyerLanguageService({ isBuyer: true, language: 'en' }),
    );

    await job.run(buildPayload());

    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        notification: expect.objectContaining({
          title: 'Order canceled',
          body: 'Order ORD-1001 was canceled.',
        }),
      }),
    );
  });

  it('re-resolves the language between runs on the same payload', async () => {
    const repository = buildSubscriptionRepository();
    const sender = buildSender();
    const buyerLanguageService = buildBuyerLanguageService({
      isBuyer: true,
      language: 'vi',
    });
    const job = buildJob(repository, sender, buyerLanguageService);
    const payload = buildPayload();

    await job.run(payload);
    buyerLanguageService.resolve.mockResolvedValue({
      isBuyer: true,
      language: 'en',
    });
    await job.run(payload);

    expect(sender.send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        notification: expect.objectContaining({
          title: 'Đơn hàng đã hủy',
          body: 'Đơn hàng ORD-1001 đã bị hủy.',
        }),
      }),
    );
    expect(sender.send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        notification: expect.objectContaining({
          title: 'Order canceled',
          body: 'Order ORD-1001 was canceled.',
        }),
      }),
    );
  });

  it('keeps the stored English copy for a seller account', async () => {
    const repository = buildSubscriptionRepository();
    const sender = buildSender();
    const job = buildJob(
      repository,
      sender,
      buildBuyerLanguageService({ isBuyer: false, language: 'en' }),
    );

    await job.run(buildPayload());

    expect(sender.send).toHaveBeenCalledWith({
      subscription: SUBSCRIPTION,
      notification: {
        id: 'notification-1',
        title: 'Order canceled',
        body: 'Order ORD-1001 was canceled.',
        data: DATA,
      },
    });
  });

  it('keeps the stored English copy for an unknown notification type', async () => {
    const repository = buildSubscriptionRepository();
    const sender = buildSender();
    const job = buildJob(
      repository,
      sender,
      buildBuyerLanguageService({ isBuyer: true, language: 'vi' }),
    );
    const data = { type: 'order.refunded', orderId: 'order-1' };

    await job.run(buildPayload({ data }));

    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        notification: expect.objectContaining({
          title: 'Order canceled',
          body: 'Order ORD-1001 was canceled.',
          data,
        }),
      }),
    );
  });

  it('keeps the stored English copy when required order data is missing', async () => {
    const repository = buildSubscriptionRepository();
    const sender = buildSender();
    const job = buildJob(
      repository,
      sender,
      buildBuyerLanguageService({ isBuyer: true, language: 'vi' }),
    );
    const data = { type: 'order.canceled', orderId: 'order-1' };

    await job.run(buildPayload({ data }));

    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        notification: expect.objectContaining({
          title: 'Order canceled',
          body: 'Order ORD-1001 was canceled.',
          data,
        }),
      }),
    );
  });

  it('sends the localized payload to every active subscription', async () => {
    const secondSubscription: WebPushSubscriptionSummary = {
      ...SUBSCRIPTION,
      id: 'subscription-2',
      endpoint: 'https://push.example.com/2',
    };
    const repository = buildSubscriptionRepository([
      SUBSCRIPTION,
      secondSubscription,
    ]);
    const sender = buildSender();
    const job = buildJob(
      repository,
      sender,
      buildBuyerLanguageService({ isBuyer: true, language: 'vi' }),
    );

    await job.run(buildPayload());

    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(sender.send).toHaveBeenNthCalledWith(1, {
      subscription: SUBSCRIPTION,
      notification: expect.objectContaining({
        title: 'Đơn hàng đã hủy',
        body: 'Đơn hàng ORD-1001 đã bị hủy.',
      }),
    });
    expect(sender.send).toHaveBeenNthCalledWith(2, {
      subscription: secondSubscription,
      notification: expect.objectContaining({
        title: 'Đơn hàng đã hủy',
        body: 'Đơn hàng ORD-1001 đã bị hủy.',
      }),
    });
    expect(repository.markUsedById).toHaveBeenCalledWith('subscription-1');
    expect(repository.markUsedById).toHaveBeenCalledWith('subscription-2');
  });

  it('deactivates a gone subscription and keeps delivering to the rest', async () => {
    const goneSubscription: WebPushSubscriptionSummary = {
      ...SUBSCRIPTION,
      id: 'subscription-gone',
      endpoint: 'https://push.example.com/gone',
    };
    const repository = buildSubscriptionRepository([
      goneSubscription,
      SUBSCRIPTION,
    ]);
    const sender = buildSender();
    const job = buildJob(
      repository,
      sender,
      buildBuyerLanguageService({ isBuyer: true, language: 'vi' }),
    );
    sender.send.mockRejectedValueOnce(
      new WebPushDeliveryError('Gone', 410),
    );

    await job.run(buildPayload());

    expect(repository.deactivateById).toHaveBeenCalledWith('subscription-gone');
    expect(repository.markUsedById).not.toHaveBeenCalledWith(
      'subscription-gone',
    );
    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(repository.markUsedById).toHaveBeenCalledWith('subscription-1');
  });
});
