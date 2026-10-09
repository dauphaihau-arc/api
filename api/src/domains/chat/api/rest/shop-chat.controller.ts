import {
  Body,
  Controller,
  Get,
  Header,
  Patch,
  Param,
  Post,
  Query,
  UseFilters,
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
import { ChatPublicReferenceService } from '../../app/services/chat-public-reference.service';
import {
  buildChatConversationListQuery,
  buildChatMessageListQuery,
} from './queries/chat.queries';
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
} from './responses/chat.response';
import { ChatExceptionsFilter } from './errors/chat-exceptions.filter';

@Controller('shops/:shop_id/chat')
@UseFilters(ChatExceptionsFilter)
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('shops.manage')
@ApiTags('Shop Chat')
@ApiCookieAuth('accessCookie')
export class ShopChatController {
  constructor(
    private readonly chatPublicReferenceService: ChatPublicReferenceService,
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
    @Param('shop_id') shopPublicId: string,
    @Query() query: ListChatConversationsQueryDto,
  ) {
    const shopId = await this.chatPublicReferenceService.resolveManageableShop(currentUser, shopPublicId);

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
    @Param('shop_id') shopPublicId: string,
  ) {
    const shopId = await this.chatPublicReferenceService.resolveManageableShop(currentUser, shopPublicId);

    return {
      unread_count: await this.getShopChatUnreadCountUseCase.execute(shopId),
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
    @Param('shop_id') shopPublicId: string,
    @Param('conversation_id') conversationPublicId: string,
    @Query() query: ListChatMessagesQueryDto,
  ) {
    const { shopId, conversationId } = await this.chatPublicReferenceService.resolveManageableConversationId(
      currentUser,
      shopPublicId,
      conversationPublicId,
    );
    return toChatMessageListResponse(
      await this.getShopChatMessagesUseCase.execute(
        shopId,
        conversationId,
        buildChatMessageListQuery(query),
      ),
    );
  }

  @Patch('conversations/:conversation_id/read')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Mark shop chat conversation as read' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'conversation_id', type: String })
  @ApiOkResponse({ description: 'Updated chat conversation.', schema: { type: 'object' } })
  async markConversationRead(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Param('conversation_id') conversationPublicId: string,
  ) {
    const { shopId, conversationId } = await this.chatPublicReferenceService.resolveManageableConversationId(
      currentUser,
      shopPublicId,
      conversationPublicId,
    );
    return {
      conversation: toChatConversationResponse(
        await this.markShopChatConversationReadUseCase.execute(shopId, conversationId),
      ),
    };
  }

  @Post('conversations/:conversation_id/messages')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Send a shop chat message' })
  @ApiParam({ name: 'shop_id', type: String })
  @ApiParam({ name: 'conversation_id', type: String })
  @ApiOkResponse({ description: 'Created chat message.', schema: { type: 'object' } })
  async sendMessage(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('shop_id') shopPublicId: string,
    @Param('conversation_id') conversationPublicId: string,
    @Body() body: SendChatMessageDto,
  ) {
    const { shopId, conversationId } = await this.chatPublicReferenceService.resolveManageableConversationId(
      currentUser,
      shopPublicId,
      conversationPublicId,
    );
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
}
