import { CreateNotificationUseCase } from './create-notification.use-case';
import type { NotificationRepository } from '../../ports/notification.repository';

describe('CreateNotificationUseCase', () => {
  function buildRepository(): jest.Mocked<NotificationRepository> {
    return {
      create: jest.fn().mockImplementation(async (input) => ({
        id: 'notification-1',
        userId: input.userId,
        type: input.type,
        channel: input.channel ?? 'in_app',
        title: input.title,
        body: input.body,
        data: input.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      findAllOwnedByUserId: jest.fn(),
      countUnreadOwnedByUserId: jest.fn(),
      markOwnedByIdAsRead: jest.fn(),
      markAllOwnedByUserIdAsRead: jest.fn(),
    };
  }

  it('defaults new notifications to the in_app channel', async () => {
    const repository = buildRepository();
    const useCase = new CreateNotificationUseCase(repository);

    const result = await useCase.execute({
      userId: 'user-1',
      type: 'order.status-updated',
      title: 'Order updated',
      body: 'Your order has been shipped.',
    });

    expect(repository.create).toHaveBeenCalledWith({
      userId: 'user-1',
      type: 'order.status-updated',
      title: 'Order updated',
      body: 'Your order has been shipped.',
      channel: 'in_app',
    });
    expect(result.channel).toBe('in_app');
  });
});
