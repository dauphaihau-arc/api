import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '~/common/decorators/current-user.decorator';
import {
  WEB_PUSH_CONFIG,
  type WebPushConfig
} from '~/config/web-push.config';
import { JwtAuthGuard } from '~/modules/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/modules/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { buildListMyNotificationsQuery } from '../../app/notification.types';
import { GetMyNotificationUnreadCountUseCase } from '../../app/use-cases/get-my-notification-unread-count/get-my-notification-unread-count.use-case';
import { ListMyNotificationsUseCase } from '../../app/use-cases/list-my-notifications/list-my-notifications.use-case';
import { MarkAllMyNotificationsAsReadUseCase } from '../../app/use-cases/mark-all-my-notifications-as-read/mark-all-my-notifications-as-read.use-case';
import { MarkMyNotificationAsReadUseCase } from '../../app/use-cases/mark-my-notification-as-read/mark-my-notification-as-read.use-case';
import { RegisterWebPushSubscriptionUseCase } from '../../app/use-cases/register-web-push-subscription/register-web-push-subscription.use-case';
import { UnregisterWebPushSubscriptionUseCase } from '../../app/use-cases/unregister-web-push-subscription/unregister-web-push-subscription.use-case';
import { ListMyNotificationsQueryDto } from './dto/list-my-notifications.query.dto';
import { RegisterWebPushSubscriptionDto } from './dto/register-web-push-subscription.dto';
import { UnregisterWebPushSubscriptionDto } from './dto/unregister-web-push-subscription.dto';
import {
  toNotificationListResponse,
  toNotificationResponse
} from './notification.response';

@Controller('me/notifications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiTags('My Notifications')
@ApiCookieAuth('accessCookie')
export class MeNotificationsController {
  constructor(
    private readonly listMyNotificationsUseCase: ListMyNotificationsUseCase,
    private readonly getMyNotificationUnreadCountUseCase: GetMyNotificationUnreadCountUseCase,
    private readonly markMyNotificationAsReadUseCase: MarkMyNotificationAsReadUseCase,
    private readonly markAllMyNotificationsAsReadUseCase: MarkAllMyNotificationsAsReadUseCase,
    private readonly registerWebPushSubscriptionUseCase: RegisterWebPushSubscriptionUseCase,
    private readonly unregisterWebPushSubscriptionUseCase: UnregisterWebPushSubscriptionUseCase,
    @Inject(WEB_PUSH_CONFIG)
    private readonly webPushConfig: WebPushConfig
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'List my notifications' })
  @ApiOkResponse({
    description: 'Paginated notification list.',
    schema: { type: 'object' },
  })
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ListMyNotificationsQueryDto
  ) {
    return toNotificationListResponse(
      await this.listMyNotificationsUseCase.execute(
        currentUser,
        buildListMyNotificationsQuery({
          page: query.page,
          limit: query.limit,
        })
      )
    );
  }

  @Get('unread-count')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get my unread notification count' })
  @ApiOkResponse({
    description: 'Unread notification count.',
    schema: { type: 'object' },
  })
  async unreadCount(@CurrentUser() currentUser: AuthenticatedUser) {
    return {
      unread_count: await this.getMyNotificationUnreadCountUseCase.execute(
        currentUser
      ),
    };
  }

  @Patch(':id/read')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Mark one notification as read' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({
    description: 'Updated notification.',
    schema: { type: 'object' },
  })
  async markAsRead(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string
  ) {
    return {
      notification: toNotificationResponse(
        await this.markMyNotificationAsReadUseCase.execute(currentUser, id)
      ),
    };
  }

  @Patch('read-all')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiOkResponse({
    description: 'Bulk read result.',
    schema: { type: 'object' },
  })
  async markAllAsRead(@CurrentUser() currentUser: AuthenticatedUser) {
    const result = await this.markAllMyNotificationsAsReadUseCase.execute(
      currentUser
    );

    return {
      updated_count: result.updatedCount,
    };
  }

  @Get('web-push/public-key')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get the web push public key' })
  @ApiOkResponse({
    description: 'Web push public key configuration.',
    schema: { type: 'object' },
  })
  getWebPushPublicKey() {
    return {
      enabled: this.webPushConfig.enabled,
      public_key: this.webPushConfig.publicKey ?? null,
    };
  }

  @Post('web-push/subscriptions')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Register a web push subscription' })
  @ApiOkResponse({
    description: 'Registered web push subscription.',
    schema: { type: 'object' },
  })
  async registerWebPushSubscription(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: RegisterWebPushSubscriptionDto,
    @Req() request: Request
  ) {
    const subscription = await this.registerWebPushSubscriptionUseCase.execute(
      currentUser,
      {
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: request.get('user-agent') ?? undefined,
      }
    );

    return {
      subscription: {
        id: subscription.id,
        endpoint: subscription.endpoint,
        is_active: subscription.isActive,
        created_at: subscription.createdAt,
        updated_at: subscription.updatedAt,
      },
    };
  }

  @Delete('web-push/subscriptions')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Unregister a web push subscription' })
  @ApiOkResponse({
    description: 'Removal result.',
    schema: { type: 'object' },
  })
  async unregisterWebPushSubscription(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: UnregisterWebPushSubscriptionDto
  ) {
    return {
      removed: await this.unregisterWebPushSubscriptionUseCase.execute(
        currentUser,
        body.endpoint
      ),
    };
  }
}
