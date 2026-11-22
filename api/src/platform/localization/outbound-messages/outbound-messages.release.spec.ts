import type { EntityManager } from '@mikro-orm/postgresql';
import { Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import type { AuthUserRepository } from '~/domains/auth/app/ports/auth-user.repository';
import type { UserPreferenceRepository } from '~/domains/auth/app/ports/user-preference.repository';
import { BuyerLanguageService } from '~/domains/auth/app/services/buyer-language.service';
import { passwordResetCatalog } from '~/domains/auth/app/outbound-messages/password-reset.message';
import type { CartRepository } from '~/domains/cart/app/ports/cart.repository';
import { CartKind } from '~/domains/cart/domain/enums/cart-kind.enum';
import { CreateGuestOrderFromCartUseCase } from '~/domains/checkout/app/use-cases/create-guest-order-from-cart/create-guest-order-from-cart.use-case';
import type { NotificationRepository } from '~/domains/notification/app/ports/notification.repository';
import type { WebPushSender } from '~/domains/notification/app/ports/web-push-sender';
import type { WebPushSubscriptionRepository } from '~/domains/notification/app/ports/web-push-subscription.repository';
import type { NotificationSummary } from '~/domains/notification/app/notification.types';
import { ListMyNotificationsUseCase } from '~/domains/notification/app/use-cases/list-my-notifications/list-my-notifications.use-case';
import { SendWebPushNotificationJob } from '~/domains/notification/jobs/send-web-push-notification.job';
import { guestOrderConfirmationCatalog } from '~/domains/order/app/outbound-messages/guest-order-confirmation.message';
import {
  ORDER_CANCELED_NOTIFICATION_ID,
  orderNotificationCatalog,
} from '~/domains/order/app/outbound-messages/order-notifications.message';
import {
  refundEmailCatalog,
  renderRefundSucceededEmail,
  type RefundSucceededMessageData,
} from '~/domains/order/app/outbound-messages/refund-emails.message';
import { SendGuestOrderConfirmationEmailJob } from '~/domains/order/jobs/send-guest-order-confirmation-email.job';
import { SendRefundFailedEmailJob } from '~/domains/order/jobs/send-refund-failed-email.job';
import { SendRefundSucceededEmailJob } from '~/domains/order/jobs/send-refund-succeeded-email.job';
import type { GuestOrderTrackingTokenService } from '~/domains/order/app/services/guest-order-tracking-token.service';
import type { LoadCheckoutQuoteService } from '~/domains/order/app/services/load-checkout-quote.service';
import type { OrderCheckoutService } from '~/domains/order/app/services/order-checkout.service';
import {
  renderWelcomeEmail,
  welcomeCatalog,
} from '~/domains/user/app/outbound-messages/welcome.message';
import { SendWelcomeEmailJob } from '~/domains/user/jobs/send-welcome-email.job';
import type { MailSender } from '~/integrations/mail/app/ports/mail-sender';
import type { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import type { PaymentConfig } from '~/platform/config/payment.config';
import type { AppJobPayloadMap } from '~/platform/jobs/app-job.types';
import { formatOutboundMoney } from './format-outbound-money';
import {
  MissingOutboundMessageDataError,
} from './outbound-message-renderer';
import type {
  OutboundMessageCatalog,
  OutboundMessageTemplate,
} from './outbound-message.types';

type BuyerLanguage = 'en' | 'vi';

function flattenTemplate(
  value: unknown,
  prefix = '',
): Array<[string, string]> {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      flattenTemplate(item, `${prefix}[${index}]`));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, nested]) =>
      flattenTemplate(nested, prefix ? `${prefix}.${key}` : key));
  }

  return [[prefix, String(value)]];
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)]
    .map((match) => match[1])
    .sort();
}

function makeNotification(
  overrides: Partial<NotificationSummary> & Pick<NotificationSummary, 'type' | 'title' | 'body'>,
): NotificationSummary {
  return {
    id: `notification-${overrides.type}-${overrides.title}`,
    userId: 'buyer-1',
    channel: 'in_app',
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeOrderEntityManager(
  order: Record<string, unknown> | null,
): EntityManager {
  return {
    fork: jest.fn(() => ({
      getRepository: jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(order),
      })),
    })),
  } as unknown as EntityManager;
}

function makeMailSender(): jest.Mocked<MailSender> {
  return { send: jest.fn().mockResolvedValue(undefined) };
}

function makeNotificationRepository(
  items: NotificationSummary[],
): jest.Mocked<NotificationRepository> {
  return {
    create: jest.fn(),
    findAllOwnedByUserId: jest.fn().mockResolvedValue({ items, total: items.length }),
    countUnreadOwnedByUserId: jest.fn().mockResolvedValue(0),
    markOwnedByIdAsRead: jest.fn().mockResolvedValue(null),
    markAllOwnedByUserIdAsRead: jest.fn().mockResolvedValue(0),
  } as unknown as jest.Mocked<NotificationRepository>;
}

function makeWebPushSender(): jest.Mocked<WebPushSender> {
  return { send: jest.fn().mockResolvedValue(undefined) };
}

function makeSubscriptionRepository(): jest.Mocked<WebPushSubscriptionRepository> {
  return {
    upsert: jest.fn(),
    deactivateOwnedByEndpoint: jest.fn(),
    findActiveOwnedByUserId: jest.fn().mockResolvedValue([
      {
        id: 'subscription-1',
        userId: 'buyer-1',
        endpoint: 'https://push.example.com/1',
        p256dh: 'p256dh',
        auth: 'auth',
        isActive: true,
        createdAt: new Date('2026-11-01T00:00:00.000Z'),
        updatedAt: new Date('2026-11-01T00:00:00.000Z'),
      },
    ]),
    markUsedById: jest.fn().mockResolvedValue(undefined),
    deactivateById: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<WebPushSubscriptionRepository>;
}

function makeBuyerLanguageService(
  rolesByUserId: Record<string, string[]>,
  preferences: Map<string, BuyerLanguage>,
): BuyerLanguageService {
  const authUserRepository = {
    findById: jest.fn(async (userId: string) => {
      const roles = rolesByUserId[userId];

      return roles ? { id: userId, roles } : null;
    }),
  } as unknown as AuthUserRepository;
  const userPreferenceRepository = {
    findByUserId: jest.fn(async (userId: string) => {
      const language = preferences.get(userId);

      return language
        ? { region: 'United States', language, currency: 'USD' }
        : null;
    }),
  } as unknown as UserPreferenceRepository;

  return new BuyerLanguageService(authUserRepository, userPreferenceRepository);
}

function lastMail(mailSender: jest.Mocked<MailSender>) {
  const calls = mailSender.send.mock.calls;

  return calls[calls.length - 1][0];
}

const pushPayload: AppJobPayloadMap['notification.send-web-push'] = {
  userId: 'buyer-1',
  notificationId: 'notification-order-canceled',
  title: 'Order canceled',
  body: 'Order ORD-1001 was canceled.',
  data: {
    type: ORDER_CANCELED_NOTIFICATION_ID,
    orderNumber: 'ORD-1001',
  },
};

const buyerNotification = makeNotification({
  type: ORDER_CANCELED_NOTIFICATION_ID,
  title: 'Order canceled',
  body: 'Order ORD-1001 was canceled.',
  data: { type: ORDER_CANCELED_NOTIFICATION_ID, orderNumber: 'ORD-1001' },
});

const buyerOrder = {
  id: 'order-1',
  publicId: 'ord_vi_1',
  customerEmail: 'buyer@example.com',
  shop: { shopName: 'Shop Vi' },
  language: 'vi',
  currency: 'USD',
  total: 25,
  paymentDetails: { refund_amount: 25 },
};

const buyerCatalogs: Array<[string, OutboundMessageCatalog]> = [
  ['guest order confirmation', guestOrderConfirmationCatalog],
  ['refund email', refundEmailCatalog],
  ['welcome', welcomeCatalog],
  ['password reset', passwordResetCatalog],
  ['order notification', orderNotificationCatalog],
];

describe('Outbound messages release verification', () => {
  describe('buyer catalog parity', () => {
    it.each(buyerCatalogs)(
      'keeps %s English and Vietnamese key and placeholder parity',
      (_name, catalog) => {
        expect(Object.keys(catalog).length).toBeGreaterThan(0);

        for (const entry of Object.values(catalog)) {
          expect(entry.vi).toBeDefined();
          const english = new Map(flattenTemplate(entry.en));
          const vietnamese = new Map(
            flattenTemplate(entry.vi as OutboundMessageTemplate),
          );

          expect([...vietnamese.keys()].sort())
            .toEqual([...english.keys()].sort());

          for (const [key, englishValue] of english) {
            expect(placeholders(vietnamese.get(key) ?? ''))
              .toEqual(placeholders(englishValue));
          }
        }
      },
    );
  });

  describe('order-bound versus live language sources', () => {
    it('keeps the order email in Order Language while live channels follow preference', async () => {
      const preferences = new Map<string, BuyerLanguage>([['buyer-1', 'en']]);
      const buyerLanguageService = makeBuyerLanguageService(
        { 'buyer-1': ['customer'] },
        preferences,
      );
      const refundMailSender = makeMailSender();
      const accountMailSender = makeMailSender();
      const refundJob = new SendRefundSucceededEmailJob(
        makeOrderEntityManager(buyerOrder),
        refundMailSender,
      );
      const welcomeJob = new SendWelcomeEmailJob(
        accountMailSender,
        buyerLanguageService,
      );
      const listUseCase = new ListMyNotificationsUseCase(
        makeNotificationRepository([buyerNotification]),
        buyerLanguageService,
      );
      const pushSender = makeWebPushSender();
      const pushJob = new SendWebPushNotificationJob(
        makeSubscriptionRepository(),
        pushSender,
        buyerLanguageService,
      );
      const actor = { userId: 'buyer-1' } as AuthenticatedUser;

      await refundJob.run({ orderId: 'order-1' });
      await welcomeJob.run({
        userId: 'buyer-1',
        email: 'buyer@example.com',
        displayName: 'Buyer',
      });
      const englishList = await listUseCase.execute(actor, { page: 1, limit: 10 });
      await pushJob.run(pushPayload);

      expect(lastMail(refundMailSender).subject)
        .toBe('Đã hoàn tiền cho đơn hàng ord_vi_1');
      expect(lastMail(accountMailSender).subject).toBe('Welcome');
      expect(englishList.results[0]).toEqual(expect.objectContaining({
        title: 'Order canceled',
        body: 'Order ORD-1001 was canceled.',
      }));
      expect(pushSender.send).toHaveBeenLastCalledWith(expect.objectContaining({
        notification: expect.objectContaining({
          title: 'Order canceled',
          body: 'Order ORD-1001 was canceled.',
        }),
      }));

      preferences.set('buyer-1', 'vi');

      await welcomeJob.run({
        userId: 'buyer-1',
        email: 'buyer@example.com',
        displayName: 'Buyer',
      });
      const vietnameseList = await listUseCase.execute(actor, { page: 1, limit: 10 });
      await pushJob.run(pushPayload);
      await refundJob.run({ orderId: 'order-1' });

      expect(lastMail(accountMailSender).subject).toBe('Chào mừng');
      expect(vietnameseList.results[0]).toEqual(expect.objectContaining({
        title: 'Đơn hàng đã hủy',
        body: 'Đơn hàng ORD-1001 đã bị hủy.',
      }));
      expect(pushSender.send).toHaveBeenLastCalledWith(expect.objectContaining({
        notification: expect.objectContaining({
          title: 'Đơn hàng đã hủy',
          body: 'Đơn hàng ORD-1001 đã bị hủy.',
        }),
      }));
      expect(lastMail(refundMailSender).subject)
        .toBe('Đã hoàn tiền cho đơn hàng ord_vi_1');
      expect(refundMailSender.send).toHaveBeenCalledTimes(2);
    });

    it('keeps an English order email English for a Vietnamese-preference buyer', async () => {
      const preferences = new Map<string, BuyerLanguage>([['buyer-1', 'vi']]);
      const buyerLanguageService = makeBuyerLanguageService(
        { 'buyer-1': ['customer'] },
        preferences,
      );
      const refundMailSender = makeMailSender();
      const refundJob = new SendRefundSucceededEmailJob(
        makeOrderEntityManager({
          ...buyerOrder,
          language: 'en',
          publicId: 'ord_en_1',
        }),
        refundMailSender,
      );

      await refundJob.run({ orderId: 'order-1' });

      expect(await buyerLanguageService.resolve('buyer-1'))
        .toEqual({ isBuyer: true, language: 'vi' });
      const message = lastMail(refundMailSender);
      expect(message.subject).toBe('Refund completed for order ord_en_1');
      expect(message.text).toContain('Refund amount: $25.00');
      expect(message.html).toContain('lang="en"');
      expect(JSON.stringify(message)).not.toContain('hoàn tiền');
    });
  });

  it('carries checkout order language into the guest confirmation email', async () => {
    const dispatched: Array<{
      name: string;
      payload: AppJobPayloadMap['order.send-guest-confirmation-email'];
    }> = [];
    const cartRepository = {
      findCartByIdForActor: jest.fn().mockResolvedValue({
        id: 'cart-1',
        userId: null,
        guestSessionId: 'guest-1',
        kind: CartKind.ACTIVE,
        items: [{
          quantity: 1,
          isSelectOrder: true,
          inventory: { inventoryId: 'inventory-1' },
        }],
      }),
    } as unknown as jest.Mocked<CartRepository>;
    const loadCheckoutQuoteService = {
      loadForGuest: jest.fn().mockResolvedValue({
        id: 'quote-1',
        cartId: 'cart-1',
        shippingAddress: {
          fullName: 'Jane Doe',
          address1: '123 Main',
          city: 'HCMC',
          country: 'VN',
          state: 'HCM',
          zip: '700000',
          phone: '0123',
        },
        items: [{ inventoryId: 'inventory-1', quantity: 1 }],
        shopAdjustments: [],
      }),
    } as unknown as jest.Mocked<LoadCheckoutQuoteService>;
    const orderCheckoutService = {
      createOrders: jest.fn().mockResolvedValue({
        language: 'vi',
        orderShops: [{
          id: 'order-1',
          publicId: 'ord_public1',
          shopName: 'Shop 1',
        }],
      }),
    } as unknown as jest.Mocked<OrderCheckoutService>;
    const jobDispatcher = {
      dispatch: jest.fn(async (
        name: string,
        payload: AppJobPayloadMap['order.send-guest-confirmation-email'],
      ) => {
        dispatched.push({ name, payload });
      }),
    } as unknown as jest.Mocked<JobDispatcher>;
    const tokenService = {
      issue: jest.fn().mockReturnValue('token-1'),
    } as unknown as jest.Mocked<GuestOrderTrackingTokenService>;
    const useCase = new CreateGuestOrderFromCartUseCase(
      cartRepository,
      loadCheckoutQuoteService,
      orderCheckoutService,
      jobDispatcher,
      tokenService,
      { appBaseUrl: 'https://example.com' } as PaymentConfig,
    );

    await useCase.execute('guest-1', {
      paymentType: 'card' as never,
      quoteId: 'quote-1',
      guest: { email: 'guest@example.com' },
    });

    const dispatchedEmail = dispatched.find(
      (entry) => entry.name === 'order.send-guest-confirmation-email',
    );
    expect(dispatchedEmail?.payload.language).toBe('vi');

    const mailSender = makeMailSender();
    await new SendGuestOrderConfirmationEmailJob(mailSender).run(
      dispatchedEmail!.payload,
    );
    const message = lastMail(mailSender);

    expect(message.subject).toBe('Xác nhận đơn hàng: ord_public1');
    expect(message.text).toContain('Cảm ơn bạn đã đặt hàng từ Shop 1.');
    expect(message.html).toContain('lang="vi"');
  });

  describe('seller and admin accounts', () => {
    it.each([
      ['seller', 'seller-1'],
      ['admin', 'admin-1'],
    ])('keeps %s email, in-app, and Web Push copy English', async (_role, userId) => {
      const preferences = new Map<string, BuyerLanguage>([[userId, 'vi']]);
      const buyerLanguageService = makeBuyerLanguageService(
        { [userId]: [_role] },
        preferences,
      );
      const mailSender = makeMailSender();
      const welcomeJob = new SendWelcomeEmailJob(
        mailSender,
        buyerLanguageService,
      );
      const stored = makeNotification({
        userId,
        type: ORDER_CANCELED_NOTIFICATION_ID,
        title: 'Stored seller copy',
        body: 'Stored seller body',
        data: { type: ORDER_CANCELED_NOTIFICATION_ID, orderNumber: 'ORD-2002' },
      });
      const listUseCase = new ListMyNotificationsUseCase(
        makeNotificationRepository([stored]),
        buyerLanguageService,
      );
      const pushSender = makeWebPushSender();
      const pushJob = new SendWebPushNotificationJob(
        makeSubscriptionRepository(),
        pushSender,
        buyerLanguageService,
      );

      await welcomeJob.run({
        userId,
        email: `${userId}@example.com`,
        displayName: 'Staff',
      });
      const list = await listUseCase.execute(
        { userId } as AuthenticatedUser,
        { page: 1, limit: 10 },
      );
      await pushJob.run({
        userId,
        notificationId: 'notification-staff',
        title: 'Stored seller copy',
        body: 'Stored seller body',
        data: { type: ORDER_CANCELED_NOTIFICATION_ID, orderNumber: 'ORD-2002' },
      });

      expect(lastMail(mailSender).subject).toBe('Welcome');
      expect(lastMail(mailSender).text).toContain('Welcome to the marketplace');
      expect(list.results[0]).toEqual(expect.objectContaining({
        title: 'Stored seller copy',
        body: 'Stored seller body',
      }));
      expect(pushSender.send).toHaveBeenLastCalledWith(expect.objectContaining({
        notification: expect.objectContaining({
          title: 'Stored seller copy',
          body: 'Stored seller body',
        }),
      }));
    });
  });

  describe('fallbacks', () => {
    it('keeps stored English for incomplete known notifications and unknown types', async () => {
      const preferences = new Map<string, BuyerLanguage>([['buyer-1', 'vi']]);
      const buyerLanguageService = makeBuyerLanguageService(
        { 'buyer-1': ['customer'] },
        preferences,
      );
      const incomplete = makeNotification({
        type: ORDER_CANCELED_NOTIFICATION_ID,
        title: 'Stored cancel without order number',
        body: 'Stored cancel body without order number',
        data: {},
      });
      const unknown = makeNotification({
        type: 'legacy.mystery.event',
        title: 'Legacy stored title',
        body: 'Legacy stored body',
        data: { legacy: true },
      });
      const listUseCase = new ListMyNotificationsUseCase(
        makeNotificationRepository([incomplete, unknown]),
        buyerLanguageService,
      );

      const list = await listUseCase.execute(
        { userId: 'buyer-1' } as AuthenticatedUser,
        { page: 1, limit: 10 },
      );

      expect(list.results).toEqual([
        expect.objectContaining({
          title: 'Stored cancel without order number',
          body: 'Stored cancel body without order number',
        }),
        expect.objectContaining({
          title: 'Legacy stored title',
          body: 'Legacy stored body',
        }),
      ]);
    });

    it('falls the whole message back to English when Vietnamese copy is missing', async () => {
      const englishOnlyWelcome: OutboundMessageCatalog = {
        'account.welcome': { en: welcomeCatalog['account.welcome'].en },
      };

      const rendered = renderWelcomeEmail(
        'vi',
        { displayName: 'Buyer', email: 'buyer@example.com' },
        englishOnlyWelcome,
      );

      expect(rendered.subject).toBe('Welcome');
      expect(rendered.text).toContain('Welcome to the marketplace');
      expect(rendered.text).not.toContain('Chào mừng');
      expect(rendered.html).toContain('lang="en"');
    });

    it('never emits unresolved placeholders or half-translated copy', () => {
      expect(() => renderRefundSucceededEmail(
        'vi',
        {
          orderPublicId: 'ord_vi_1',
          shopName: 'Shop Vi',
        } as unknown as RefundSucceededMessageData,
      )).toThrow(MissingOutboundMessageDataError);
    });
  });

  describe('email presentation', () => {
    it('uses the shared responsive layout with a plain-text alternative', async () => {
      const mailSender = makeMailSender();
      await new SendRefundSucceededEmailJob(
        makeOrderEntityManager(buyerOrder),
        mailSender,
      ).run({ orderId: 'order-1' });
      const message = lastMail(mailSender);

      expect(message.html).toContain('<meta name="viewport"');
      expect(message.html).toContain('@media (max-width: 600px)');
      expect(message.html).toContain('role="presentation"');
      expect(message.html).toContain('lang="vi"');
      expect(message.text).toContain('ord_vi_1');
      expect(message.text).toMatch(/Số tiền hoàn: 25,00\sUS\$/u);
      expect(message.text).not.toContain('<p');
    });
  });

  describe('money and provider failure safety', () => {
    it('localizes money without converting currency', () => {
      const usd = formatOutboundMoney('vi', 25, 'USD');
      const vnd = formatOutboundMoney('vi', 250000, 'VND');

      expect(usd).toMatch(/^25,00\sUS\$$/u);
      expect(usd).not.toContain('₫');
      expect(vnd).toMatch(/^250\.000\s₫$/u);
      expect(vnd).not.toContain('US$');
      expect(vnd).not.toContain('$25');
    });

    it('keeps raw provider failure text out of buyer copy while logging it', async () => {
      const rawReason = 'Stripe timeout from private provider diagnostics';
      const mailSender = makeMailSender();
      const job = new SendRefundFailedEmailJob(
        makeOrderEntityManager({
          ...buyerOrder,
          paymentDetails: { refund_failed_reason: rawReason },
        }),
        mailSender,
      );
      const loggerWarning = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation();

      try {
        await job.run({ orderId: 'order-1' });

        const message = lastMail(mailSender);
        expect(message.subject).toBe('Cập nhật hoàn tiền cho đơn hàng ord_vi_1');
        expect(message.text).toContain('Đội ngũ hỗ trợ của chúng tôi');
        expect(JSON.stringify(message)).not.toContain(rawReason);
        expect(JSON.stringify(message)).not.toContain('Stripe');
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
  });

  describe('channel surface', () => {
    it('declares only email and notification copy channels in every buyer catalog', () => {
      for (const [_name, catalog] of buyerCatalogs) {
        for (const [messageId, entry] of Object.entries(catalog)) {
          expect(messageId).not.toMatch(/sms|invoice|receipt|pdf/i);
          expect(messageId).toMatch(/^(order|account)\./);

          for (const languageTemplate of [entry.en, entry.vi]) {
            if (!languageTemplate) {
              continue;
            }

            for (const channel of Object.keys(languageTemplate)) {
              expect(['email', 'notification']).toContain(channel);
            }
          }
        }
      }
    });
  });
});
