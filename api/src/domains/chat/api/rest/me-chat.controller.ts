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
import { JwtAuthGuard } from '~/domains/auth/api/guard/jwt-auth.guard';
import { PermissionsGuard } from '~/domains/auth/api/guard/permissions.guard';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import {
  buildChatConversationListQuery,
  buildChatMessageListQuery,
} from './chat.queries';
import { GetMyChatUnreadCountUseCase } from '../../app/use-cases/get-my-chat-unread-count/get-my-chat-unread-count.use-case';
import { CreateOrGetMyChatConversationUseCase } from '../../app/use-cases/create-or-get-my-chat-conversation/create-or-get-my-chat-conversation.use-case';
import { GetMyChatMessagesUseCase } from '../../app/use-cases/get-my-chat-messages/get-my-chat-messages.use-case';
import { ListMyChatConversationsUseCase } from '../../app/use-cases/list-my-chat-conversations/list-my-chat-conversations.use-case';
import { MarkMyChatConversationReadUseCase } from '../../app/use-cases/mark-my-chat-conversation-read/mark-my-chat-conversation-read.use-case';
import { SendMyChatMessageUseCase } from '../../app/use-cases/send-my-chat-message/send-my-chat-message.use-case';
import { ChatPublicReferenceService } from '../../app/services/chat-public-reference.service';
import { CreateChatConversationDto } from './dto/create-chat-conversation.dto';
import { ListChatConversationsQueryDto } from './dto/list-chat-conversations.query.dto';
import { ListChatMessagesQueryDto } from './dto/list-chat-messages.query.dto';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import {
  toChatConversationListResponse,
  toChatConversationResponse,
  toChatMessageListResponse,
  toChatMessageResponse,
} from './chat.response';
import { ChatExceptionsFilter } from './chat-exceptions.filter';

@Controller('me/chat')
@UseFilters(ChatExceptionsFilter)
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiTags('My Chat')
@ApiCookieAuth('accessCookie')
export class MeChatController {
  constructor(
    private readonly createOrGetMyChatConversationUseCase: CreateOrGetMyChatConversationUseCase,
    private readonly listMyChatConversationsUseCase: ListMyChatConversationsUseCase,
    private readonly getMyChatUnreadCountUseCase: GetMyChatUnreadCountUseCase,
    private readonly getMyChatMessagesUseCase: GetMyChatMessagesUseCase,
    private readonly markMyChatConversationReadUseCase: MarkMyChatConversationReadUseCase,
    private readonly sendMyChatMessageUseCase: SendMyChatMessageUseCase,
    private readonly chatPublicReferenceService: ChatPublicReferenceService,
  ) {}

  @Post('conversations')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Create or get a buyer chat conversation' })
  @ApiOkResponse({ description: 'Chat conversation.', schema: { type: 'object' } })
  async createOrGetConversation(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: CreateChatConversationDto,
  ) {
    const { shopId, productId } = await this.chatPublicReferenceService.resolveBuyerReferences(body.shopId, body.productId);

    return toChatConversationResponse(
      await this.createOrGetMyChatConversationUseCase.execute(currentUser, {
        shopId,
        productId,
      }),
    );
  }

  @Get('conversations')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'List my chat conversations' })
  @ApiOkResponse({ description: 'Chat conversation list.', schema: { type: 'object' } })
  async listConversations(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ListChatConversationsQueryDto,
  ) {
    return toChatConversationListResponse(
      await this.listMyChatConversationsUseCase.execute(
        currentUser,
        buildChatConversationListQuery(query),
      ),
    );
  }

  @Get('conversations/unread-count')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'Get my unread chat conversation count' })
  @ApiOkResponse({ description: 'Unread chat count.', schema: { type: 'object' } })
  async unreadCount(@CurrentUser() currentUser: AuthenticatedUser) {
    return {
      unread_count: await this.getMyChatUnreadCountUseCase.execute(currentUser),
    };
  }

  @Get('conversations/:conversation_id/messages')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOperation({ summary: 'List my chat messages' })
  @ApiParam({ name: 'conversation_id', type: String })
  @ApiOkResponse({ description: 'Chat message list.', schema: { type: 'object' } })
  async listMessages(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('conversation_id') conversationPublicId: string,
    @Query() query: ListChatMessagesQueryDto,
  ) {
    const conversationId = await this.chatPublicReferenceService.resolveBuyerConversationId(currentUser, conversationPublicId);
    return toChatMessageListResponse(
      await this.getMyChatMessagesUseCase.execute(currentUser, conversationId, buildChatMessageListQuery(query)),
    );
  }

  @Patch('conversations/:conversation_id/read')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Mark my chat conversation as read' })
  @ApiParam({ name: 'conversation_id', type: String })
  @ApiOkResponse({ description: 'Updated chat conversation.', schema: { type: 'object' } })
  async markConversationRead(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('conversation_id') conversationPublicId: string,
  ) {
    const conversationId = await this.chatPublicReferenceService.resolveBuyerConversationId(currentUser, conversationPublicId);
    return {
      conversation: toChatConversationResponse(
        await this.markMyChatConversationReadUseCase.execute(currentUser, conversationId),
      ),
    };
  }

  @Post('conversations/:conversation_id/messages')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Send a buyer chat message' })
  @ApiParam({ name: 'conversation_id', type: String })
  @ApiOkResponse({ description: 'Created chat message.', schema: { type: 'object' } })
  async sendMessage(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('conversation_id') conversationPublicId: string,
    @Body() body: SendChatMessageDto,
  ) {
    const conversationId = await this.chatPublicReferenceService.resolveBuyerConversationId(currentUser, conversationPublicId);
    return {
      message: toChatMessageResponse(
        await this.sendMyChatMessageUseCase.execute(currentUser, conversationId, body),
      ),
    };
  }
}
