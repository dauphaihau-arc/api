import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import type { BuyerLanguageService } from '~/domains/auth/app/services/buyer-language.service';
import { ListMyNotificationsUseCase } from './list-my-notifications.use-case';
import type { NotificationRepository } from '../../ports/notification.repository';
import type { NotificationSummary } from '../../notification.types';

describe('ListMyNotificationsUseCase', () => {
  const actor = {
    userId: 'user-1',
    email: 'notify@example.com',
    displayName: 'Notify User',
    status: UserStatus.ACTIVE,
    sessionId: 'session-1',
    roles: ['customer'],
    permissions: [],
  };

  const createdAt = new Date('2026-05-25T09:00:00.000Z');
  const updatedAt = new Date('2026-05-25T09:00:00.000Z');

  function buildRepository(): jest.Mocked<NotificationRepository> {
    return {
      create: jest.fn(),
      findAllOwnedByUserId: jest.fn(),
      countUnreadOwnedByUserId: jest.fn(),
      markOwnedByIdAsRead: jest.fn(),
      markAllOwnedByUserIdAsRead: jest.fn(),
    };
  }

  function buildBuyerLanguageService(): jest.Mocked<BuyerLanguageService> {
    return {
      resolve: jest.fn().mockResolvedValue({ isBuyer: true, language: 'vi' }),
    } as unknown as jest.Mocked<BuyerLanguageService>;
  }

  function buildNotification(
    overrides: Partial<NotificationSummary> = {},
  ): NotificationSummary {
    return {
      id: 'notification-1',
      userId: actor.userId,
      type: 'order.status-updated',
      channel: 'in_app',
      title: 'Order updated',
      body: 'Your order has been shipped.',
      data: { orderNumber: 'ARC-1' },
      readAt: undefined,
      createdAt,
      updatedAt,
      ...overrides,
    };
  }

  it('returns paginated notifications for the current user', async () => {
    const repository = buildRepository();
    const buyerLanguageService = buildBuyerLanguageService();
    repository.findAllOwnedByUserId.mockResolvedValue({
      items: [buildNotification()],
      total: 1,
    });

    const useCase = new ListMyNotificationsUseCase(
      repository,
      buyerLanguageService,
    );
    const result = await useCase.execute(actor, { page: 1, limit: 20 });

    expect(repository.findAllOwnedByUserId).toHaveBeenCalledWith(
      actor.userId,
      1,
      20,
    );
    expect(result).toEqual({
      results: expect.any(Array),
      page: 1,
      limit: 20,
      totalPages: 1,
      totalResults: 1,
    });
  });

  it('localizes all order notification types for a buyer in their language', async () => {
    const repository = buildRepository();
    const buyerLanguageService = buildBuyerLanguageService();
    buyerLanguageService.resolve.mockResolvedValue({
      isBuyer: true,
      language: 'vi',
    });
    repository.findAllOwnedByUserId.mockResolvedValue({
      items: [
        buildNotification({
          id: 'notification-canceled',
          type: 'order.canceled',
        }),
        buildNotification({
          id: 'notification-fulfillment',
          type: 'order.fulfillment.updated',
        }),
        buildNotification({
          id: 'notification-shipment',
          type: 'order.shipment.updated',
        }),
      ],
      total: 3,
    });

    const useCase = new ListMyNotificationsUseCase(
      repository,
      buyerLanguageService,
    );
    const result = await useCase.execute(actor, { page: 2, limit: 10 });

    expect(result.results).toEqual([
      expect.objectContaining({
        id: 'notification-canceled',
        title: 'Đơn hàng đã hủy',
        body: 'Đơn hàng ARC-1 đã bị hủy.',
      }),
      expect.objectContaining({
        id: 'notification-fulfillment',
        title: 'Đơn hàng đã cập nhật',
        body: 'Đơn hàng ARC-1 đã được cập nhật.',
      }),
      expect.objectContaining({
        id: 'notification-shipment',
        title: 'Vận chuyển đã cập nhật',
        body: 'Thông tin vận chuyển của đơn hàng ARC-1 đã được cập nhật.',
      }),
    ]);
    expect(result.results[0]).toEqual({
      id: 'notification-canceled',
      userId: actor.userId,
      type: 'order.canceled',
      channel: 'in_app',
      title: 'Đơn hàng đã hủy',
      body: 'Đơn hàng ARC-1 đã bị hủy.',
      data: { orderNumber: 'ARC-1' },
      readAt: undefined,
      createdAt,
      updatedAt,
    });
    expect(result).toEqual({
      results: expect.any(Array),
      page: 2,
      limit: 10,
      totalPages: 1,
      totalResults: 3,
    });
  });

  it('localizes the same stored row differently when the buyer preference changes between reads', async () => {
    const repository = buildRepository();
    const buyerLanguageService = buildBuyerLanguageService();
    const stored = buildNotification({ type: 'order.canceled' });
    repository.findAllOwnedByUserId.mockResolvedValue({
      items: [stored],
      total: 1,
    });

    const useCase = new ListMyNotificationsUseCase(
      repository,
      buyerLanguageService,
    );

    buyerLanguageService.resolve.mockResolvedValueOnce({
      isBuyer: true,
      language: 'vi',
    });
    const vietnamese = await useCase.execute(actor, { page: 1, limit: 20 });

    buyerLanguageService.resolve.mockResolvedValueOnce({
      isBuyer: true,
      language: 'en',
    });
    const english = await useCase.execute(actor, { page: 1, limit: 20 });

    expect(vietnamese.results[0]).toMatchObject({
      title: 'Đơn hàng đã hủy',
      body: 'Đơn hàng ARC-1 đã bị hủy.',
    });
    expect(english.results[0]).toMatchObject({
      title: 'Order canceled',
      body: 'Order ARC-1 was canceled.',
    });
    expect(stored).toMatchObject({
      title: 'Order updated',
      body: 'Your order has been shipped.',
    });
  });

  it('keeps stored copy for a buyer when the notification type is unknown', async () => {
    const repository = buildRepository();
    const buyerLanguageService = buildBuyerLanguageService();
    repository.findAllOwnedByUserId.mockResolvedValue({
      items: [
        buildNotification({
          type: 'order.status-updated',
          title: 'Order updated',
          body: 'Your order has been shipped.',
        }),
      ],
      total: 1,
    });

    const useCase = new ListMyNotificationsUseCase(
      repository,
      buyerLanguageService,
    );
    const result = await useCase.execute(actor, { page: 1, limit: 20 });

    expect(result.results[0]).toMatchObject({
      title: 'Order updated',
      body: 'Your order has been shipped.',
    });
  });

  it('keeps stored copy for a buyer when required order data is missing', async () => {
    const repository = buildRepository();
    const buyerLanguageService = buildBuyerLanguageService();
    repository.findAllOwnedByUserId.mockResolvedValue({
      items: [
        buildNotification({
          type: 'order.canceled',
          title: 'Order canceled',
          body: 'Your order was canceled.',
          data: {},
        }),
      ],
      total: 1,
    });

    const useCase = new ListMyNotificationsUseCase(
      repository,
      buyerLanguageService,
    );
    const result = await useCase.execute(actor, { page: 1, limit: 20 });

    expect(result.results[0]).toMatchObject({
      title: 'Order canceled',
      body: 'Your order was canceled.',
    });
  });

  it('keeps stored copy for a buyer when notification data is absent', async () => {
    const repository = buildRepository();
    const buyerLanguageService = buildBuyerLanguageService();
    repository.findAllOwnedByUserId.mockResolvedValue({
      items: [
        buildNotification({
          type: 'order.canceled',
          title: 'Order canceled',
          body: 'Your order was canceled.',
          data: undefined,
        }),
      ],
      total: 1,
    });

    const useCase = new ListMyNotificationsUseCase(
      repository,
      buyerLanguageService,
    );
    const result = await useCase.execute(actor, { page: 1, limit: 20 });

    expect(result.results[0]).toMatchObject({
      title: 'Order canceled',
      body: 'Your order was canceled.',
    });
  });

  it.each([
    ['seller', ['seller']],
    ['admin', ['admin']],
  ])(
    'keeps stored English copy for a %s even when the type is known',
    async (_label, roles) => {
      const repository = buildRepository();
      const buyerLanguageService = buildBuyerLanguageService();
      buyerLanguageService.resolve.mockResolvedValue({
        isBuyer: false,
        language: 'en',
      });
      repository.findAllOwnedByUserId.mockResolvedValue({
        items: [
          buildNotification({
            type: 'order.canceled',
            title: 'Stored English title',
            body: 'Stored English body.',
          }),
        ],
        total: 1,
      });

      const useCase = new ListMyNotificationsUseCase(
        repository,
        buyerLanguageService,
      );
      const result = await useCase.execute(
        { ...actor, roles },
        { page: 1, limit: 20 },
      );

      expect(result.results[0]).toMatchObject({
        title: 'Stored English title',
        body: 'Stored English body.',
      });
    },
  );
});
