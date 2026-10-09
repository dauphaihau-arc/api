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
} from './queries/chat.queries';
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
  ChatConversationEnvelopeResponseDto,
  ChatConversationListResponseDto,
  ChatConversationResponseDto,
  ChatMessageEnvelopeResponseDto,
  ChatMessageListResponseDto,
  ChatUnreadCountResponseDto,
  toChatConversationListResponse,
  toChatConversationResponse,
  toChatMessageListResponse,
  toChatMessageResponse,
} from './responses/chat.response';
import { ChatExceptionsFilter } from './errors/chat-exceptions.filter';
import { ApiErrorResponses } from '~/platform/http/api-error-responses.decorator';
import { meChatErrorResponses } from './errors/me-chat-error-responses';

@Controller('me/chat')
@UseFilters(ChatExceptionsFilter)
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiErrorResponses(meChatErrorResponses.common)
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
  @ApiErrorResponses(meChatErrorResponses.createConversation)
  @ApiOperation({
    summary: 'Create conversation',
    description: 'Creates or returns a chat conversation for the buyer and selected shop or product.',
  })
  @ApiOkResponse({ description: 'Chat conversation.', type: ChatConversationResponseDto })
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
  @ApiErrorResponses(meChatErrorResponses.listConversations)
  @ApiOperation({
    summary: 'List conversations',
    description: 'Returns the signed-in buyer’s chat conversations.',
  })
  @ApiOkResponse({ description: 'Chat conversation list.', type: ChatConversationListResponseDto })
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
  @ApiOperation({
    summary: 'Get unread count',
    description: 'Returns the signed-in buyer’s unread chat conversation count.',
  })
  @ApiOkResponse({ description: 'Unread chat count.', type: ChatUnreadCountResponseDto })
  async unreadCount(@CurrentUser() currentUser: AuthenticatedUser) {
    return {
      unread_count: await this.getMyChatUnreadCountUseCase.execute(currentUser),
    };
  }

  @Get('conversations/:conversation_id/messages')
  @Header('Cache-Control', 'private, no-cache')
  @ApiErrorResponses(meChatErrorResponses.messages)
  @ApiOperation({
    summary: 'List messages',
    description: 'Returns messages in the specified buyer conversation.',
  })
  @ApiParam({ name: 'conversation_id', type: String })
  @ApiOkResponse({ description: 'Chat message list.', type: ChatMessageListResponseDto })
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
  @ApiErrorResponses(meChatErrorResponses.markRead)
  @ApiOperation({
    summary: 'Mark conversation read',
    description: 'Marks the specified buyer conversation as read.',
  })
  @ApiParam({ name: 'conversation_id', type: String })
  @ApiOkResponse({ description: 'Updated chat conversation.', type: ChatConversationEnvelopeResponseDto })
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
  @ApiErrorResponses(meChatErrorResponses.sendMessage)
  @ApiOperation({
    summary: 'Send message',
    description: 'Sends a message in the specified buyer conversation.',
  })
  @ApiParam({ name: 'conversation_id', type: String })
  @ApiOkResponse({ description: 'Created chat message.', type: ChatMessageEnvelopeResponseDto })
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
