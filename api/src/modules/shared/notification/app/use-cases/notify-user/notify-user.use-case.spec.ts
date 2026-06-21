import { appJobName } from '~/common/jobs/job.types';
import type { JobDispatcher } from '~/modules/shared/queue/app/ports/job-dispatcher';
import type { NotificationRepository } from '../../ports/notification.repository';
import { NotifyUserUseCase } from './notify-user.use-case';

describe('NotifyUserUseCase', () => {
  function buildNotificationRepository(): jest.Mocked<NotificationRepository> {
    return {
      create: jest.fn().mockResolvedValue({
        id: 'notification-1',
        userId: 'user-1',
        type: 'order.canceled',
        channel: 'in_app',
        title: 'Order canceled',
        body: 'Your order was canceled.',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findAllOwnedByUserId: jest.fn(),
      countUnreadOwnedByUserId: jest.fn(),
      markOwnedByIdAsRead: jest.fn(),
      markAllOwnedByUserIdAsRead: jest.fn(),
    };
  }

  function buildJobDispatcher(): jest.Mocked<JobDispatcher> {
    return {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };
  }

  it('stores an in-app notification and queues Web Push when requested', async () => {
    const repository = buildNotificationRepository();
    const jobDispatcher = buildJobDispatcher();
    const useCase = new NotifyUserUseCase(repository, jobDispatcher);

    await useCase.execute({
      userId: 'user-1',
      type: 'order.canceled',
      title: 'Order canceled',
      body: 'Your order was canceled.',
      channels: ['in_app', 'web_push'],
    });

    expect(repository.create).toHaveBeenCalled();
    expect(jobDispatcher.dispatch).toHaveBeenCalledWith(
      appJobName.sendWebPushNotification,
      expect.objectContaining({
        userId: 'user-1',
        notificationId: 'notification-1',
      }),
      expect.objectContaining({
        deduplicationKey: expect.stringContaining('notification-send-web-push'),
      }),
    );
  });
});
