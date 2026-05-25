import { UserStatus } from '~/modules/domains/auth/domain/enums/user-status.enum';
import { ListMyNotificationsUseCase } from './list-my-notifications.use-case';
import type { NotificationRepository } from '../../ports/notification.repository';

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

  function buildRepository(): jest.Mocked<NotificationRepository> {
    return {
      create: jest.fn(),
      findAllOwnedByUserId: jest.fn(),
      countUnreadOwnedByUserId: jest.fn(),
      markOwnedByIdAsRead: jest.fn(),
      markAllOwnedByUserIdAsRead: jest.fn(),
    };
  }

  it('returns paginated notifications for the current user', async () => {
    const repository = buildRepository();
    repository.findAllOwnedByUserId.mockResolvedValue({
      items: [
        {
          id: 'notification-1',
          userId: actor.userId,
          type: 'order.status-updated',
          channel: 'in_app',
          title: 'Order updated',
          body: 'Your order has been shipped.',
          createdAt: new Date('2026-05-25T09:00:00.000Z'),
          updatedAt: new Date('2026-05-25T09:00:00.000Z'),
        },
      ],
      total: 1,
    });

    const useCase = new ListMyNotificationsUseCase(repository);
    const result = await useCase.execute(actor, { page: 1, limit: 20 });

    expect(repository.findAllOwnedByUserId).toHaveBeenCalledWith(
      actor.userId,
      1,
      20
    );
    expect(result).toEqual({
      results: expect.any(Array),
      page: 1,
      limit: 20,
      totalPages: 1,
      totalResults: 1,
    });
  });
});
