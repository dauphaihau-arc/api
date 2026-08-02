import {
  Body,
  Controller,
  Get,
  Header,
  Patch,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '~/platform/decorators/current-user.decorator';
import { RequirePermissions } from '~/platform/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ShopAccessService } from '~/domains/shop/app/services/shop-access.service';
import {
  buildChatConversationListQuery,
  buildChatMessageListQuery,
} from '../../app/chat.types';
import { GetShopChatUnreadCountUseCase } from '../../app/use-cases/get-shop-chat-unread-count/get-shop-chat-unread-count.use-case';
import { GetShopChatMessagesUseCase } from '../../app/use-cases/get-shop-chat-messages/get-shop-chat-messages.use-case';
import { ListShopChatConversationsUseCase } from '../../app/use-cases/list-shop-chat-conversations/list-shop-chat-conversations.use-case';
import { MarkShopChatConversationReadUseCase } from '../../app/use-cases/mark-shop-chat-conversation-read/mark-shop-chat-conversation-read.use-case';
import { SendShopChatMessageUseCase } from '../../app/use-cases/send-shop-chat-message/send-shop-chat-message.use-case';
import { ListChatConversationsQueryDto } from './dto/list-chat-conversations.query.dto';
import { ListChatMessagesQueryDto } from './dto/list-chat-messages.query.dto';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import {
  toChatConversationListResponse,
  toChatConversationResponse,
  toChatMessageListResponse,
  toChatMessageResponse,
} from './chat.response';
import {
  isChatAppError,
  mapChatAppErrorToHttpException,
} from './chat-http-error-mapper';

@Controller('shops/:shop_id/chat')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('shops.manage')
@ApiTags('Shop Chat')
@ApiCookieAuth('accessCookie')
export class ShopChatController {
  constructor(
    private readonly shopAccessService: ShopAccessService,
    private readonly listShopChatConversationsUseCase: ListShopChatConversationsUseCase,
    private readonly getShopChatUnreadCountUseCase: GetShopChatUnreadCountUseCase,
    private readonly getShopChatMessagesUseCase: GetShopChatMessagesUseCase,
    private readonly markShopChatConversationReadUseCase: MarkShopChatConversationReadUseCase,
    private readonly sendShopChatMessageUseCase: SendShopChatMessageUseCase,
  ) {}

  @Get('conversations')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'List shop chat conversations' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({ description: 'Chat conversation list.', schema: { type: 'object' } })
  async listConversations(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Query() query: ListChatConversationsQueryDto,
  ) {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    return toChatConversationListResponse(
      await this.listShopChatConversationsUseCase.execute(
        shopId,
        buildChatConversationListQuery(query),
      ),
    );
  }

  @Get('conversations/unread-count')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get shop unread chat conversation count' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiOkResponse({ description: 'Unread chat count.', schema: { type: 'object' } })
  async unreadCount(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
  ) {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    return {
      unread_count: await this.getShopChatUnreadCountUseCase.execute(shopId, currentUser.userId),
    };
  }

  @Get('conversations/:conversation_id/messages')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'List shop chat messages' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'conversation_id', type: String })
  @ApiOkResponse({ description: 'Chat message list.', schema: { type: 'object' } })
  async listMessages(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Param('conversation_id') conversationId: string,
    @Query() query: ListChatMessagesQueryDto,
  ) {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    try {
      return toChatMessageListResponse(
        await this.getShopChatMessagesUseCase.execute(
          shopId,
          conversationId,
          buildChatMessageListQuery(query),
        ),
      );
    }
    catch (error) {
      this.throwMappedChatError(error);
    }
  }

  @Patch('conversations/:conversation_id/read')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Mark shop chat conversation as read' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'conversation_id', type: String })
  @ApiOkResponse({ description: 'Updated chat conversation.', schema: { type: 'object' } })
  async markConversationRead(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Param('conversation_id') conversationId: string,
  ) {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    try {
      return {
        conversation: toChatConversationResponse(
          await this.markShopChatConversationReadUseCase.execute(shopId, conversationId),
        ),
      };
    }
    catch (error) {
      this.throwMappedChatError(error);
    }
  }

  @Post('conversations/:conversation_id/messages')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Send a shop chat message' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'conversation_id', type: String })
  @ApiOkResponse({ description: 'Created chat message.', schema: { type: 'object' } })
  async sendMessage(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopId: string,
    @Param('conversation_id') conversationId: string,
    @Body() body: SendChatMessageDto,
  ) {
    await this.shopAccessService.assertCanManageShop(currentUser, shopId);

    try {
      return {
        message: toChatMessageResponse(
          await this.sendShopChatMessageUseCase.execute(
            currentUser,
            shopId,
            conversationId,
            body,
          ),
        ),
      };
    }
    catch (error) {
      this.throwMappedChatError(error);
    }
  }

  private throwMappedChatError(error: unknown): never {
    if (isChatAppError(error)) {
      throw mapChatAppErrorToHttpException(error);
    }

    throw error;
  }
}
