import { MikroOrmModule } from '@mikro-orm/nestjs';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SendWebPushNotificationJob } from '~/common/jobs/send-web-push-notification.job';
import { WEB_PUSH_CONFIG, buildWebPushConfig } from '~/config/web-push.config';
import { CurrentUserEntity } from '~/modules/domains/auth/infra/persistence/entities/current-user.entity';
import { QueueModule } from '../queue/queue.module';
import { MeNotificationsController } from './api/rest/me-notifications.controller';
import { NotificationRepository } from './app/ports/notification.repository';
import { WebPushSender } from './app/ports/web-push-sender';
import { WebPushSubscriptionRepository } from './app/ports/web-push-subscription.repository';
import { CreateNotificationUseCase } from './app/use-cases/create-notification/create-notification.use-case';
import { GetMyNotificationUnreadCountUseCase } from './app/use-cases/get-my-notification-unread-count/get-my-notification-unread-count.use-case';
import { ListMyNotificationsUseCase } from './app/use-cases/list-my-notifications/list-my-notifications.use-case';
import { MarkAllMyNotificationsAsReadUseCase } from './app/use-cases/mark-all-my-notifications-as-read/mark-all-my-notifications-as-read.use-case';
import { MarkMyNotificationAsReadUseCase } from './app/use-cases/mark-my-notification-as-read/mark-my-notification-as-read.use-case';
import { NotifyUserUseCase } from './app/use-cases/notify-user/notify-user.use-case';
import { RegisterWebPushSubscriptionUseCase } from './app/use-cases/register-web-push-subscription/register-web-push-subscription.use-case';
import { UnregisterWebPushSubscriptionUseCase } from './app/use-cases/unregister-web-push-subscription/unregister-web-push-subscription.use-case';
import { MikroOrmNotificationRepository } from './infra/mikro-orm-notification.repository';
import { NotificationEntity } from './infra/persistence/entities/notification.entity';
import { WebPushSubscriptionEntity } from './infra/persistence/entities/web-push-subscription.entity';
import { MikroOrmWebPushSubscriptionRepository } from './infra/mikro-orm-web-push-subscription.repository';
import { VapidWebPushSender } from './infra/web-push.sender';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => QueueModule),
    MikroOrmModule.forFeature([
      CurrentUserEntity,
      NotificationEntity,
      WebPushSubscriptionEntity,
    ]),
  ],
  controllers: [MeNotificationsController],
  providers: [
    {
      provide: WEB_PUSH_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildWebPushConfig(configService),
    },
    {
      provide: NotificationRepository,
      useClass: MikroOrmNotificationRepository,
    },
    {
      provide: WebPushSubscriptionRepository,
      useClass: MikroOrmWebPushSubscriptionRepository,
    },
    {
      provide: WebPushSender,
      useClass: VapidWebPushSender,
    },
    CreateNotificationUseCase,
    ListMyNotificationsUseCase,
    GetMyNotificationUnreadCountUseCase,
    MarkMyNotificationAsReadUseCase,
    MarkAllMyNotificationsAsReadUseCase,
    NotifyUserUseCase,
    RegisterWebPushSubscriptionUseCase,
    UnregisterWebPushSubscriptionUseCase,
    SendWebPushNotificationJob,
  ],
  exports: [
    WEB_PUSH_CONFIG,
    CreateNotificationUseCase,
    NotifyUserUseCase,
    NotificationRepository,
    WebPushSubscriptionRepository,
    WebPushSender,
    SendWebPushNotificationJob,
  ],
})
export class NotificationModule {}
