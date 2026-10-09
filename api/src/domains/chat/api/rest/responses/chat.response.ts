import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ChatParticipantResponseDto {
  @ApiProperty({ type: String, nullable: true })
  display_name!: string | null;

  @ApiProperty({ type: String, nullable: true })
  avatar!: string | null;
}

export class ChatShopResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  owner_user_id!: string;

  @ApiProperty()
  shop_name!: string;

  @ApiProperty()
  slug!: string;
}

export class ChatLastMessageResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  body_preview!: string;

  @ApiProperty()
  sender_user_id!: string;

  @ApiProperty()
  message_type!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: Date;
}

export class ChatConversationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  buyer_user_id!: string;

  @ApiProperty({ type: ChatParticipantResponseDto })
  @Type(() => ChatParticipantResponseDto)
  buyer!: ChatParticipantResponseDto;

  @ApiProperty({ type: ChatShopResponseDto })
  @Type(() => ChatShopResponseDto)
  shop!: ChatShopResponseDto;

  @ApiProperty()
  status!: string;

  @ApiProperty({ type: ChatLastMessageResponseDto, nullable: true })
  @Type(() => ChatLastMessageResponseDto)
  last_message!: ChatLastMessageResponseDto | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  last_message_at!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  last_message_sender_user_id!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  buyer_last_read_at!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  seller_last_read_at!: Date | null;

  @ApiProperty()
  buyer_unread_count!: number;

  @ApiProperty()
  seller_unread_count!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at!: Date;
}

export class ChatMessageResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  conversation_id!: string;

  @ApiProperty()
  sender_user_id!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty()
  message_type!: string;

  @ApiProperty({ type: Object, nullable: true })
  metadata!: Record<string, unknown> | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  edited_at!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at!: Date;
}

export class ChatConversationListResponseDto {
  @ApiProperty({ type: [ChatConversationResponseDto] })
  @Type(() => ChatConversationResponseDto)
  results!: ChatConversationResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total_pages!: number;

  @ApiProperty()
  total_results!: number;
}

export class ChatMessagePageInfoResponseDto {
  @ApiProperty()
  has_more_before!: boolean;

  @ApiProperty({ type: String, nullable: true })
  before_cursor!: string | null;
}

export class ChatMessageListResponseDto {
  @ApiProperty({ type: ChatConversationResponseDto })
  @Type(() => ChatConversationResponseDto)
  conversation!: ChatConversationResponseDto;

  @ApiProperty({ type: [ChatMessageResponseDto] })
  @Type(() => ChatMessageResponseDto)
  results!: ChatMessageResponseDto[];

  @ApiProperty()
  limit!: number;

  @ApiProperty({ type: ChatMessagePageInfoResponseDto })
  @Type(() => ChatMessagePageInfoResponseDto)
  page_info!: ChatMessagePageInfoResponseDto;
}

export class ChatConversationEnvelopeResponseDto {
  @ApiProperty({ type: ChatConversationResponseDto })
  @Type(() => ChatConversationResponseDto)
  conversation!: ChatConversationResponseDto;
}

export class ChatMessageEnvelopeResponseDto {
  @ApiProperty({ type: ChatMessageResponseDto })
  @Type(() => ChatMessageResponseDto)
  message!: ChatMessageResponseDto;
}

export class ChatUnreadCountResponseDto {
  @ApiProperty()
  unread_count!: number;
}

import type {
  ChatConversationListResult,
  ChatConversationSummary,
  ChatMessageListResult,
  ChatMessageSummary,
} from '../../../app/chat.types';

export function toChatConversationResponse(conversation: ChatConversationSummary) {
  return {
    id: conversation.publicId,
    buyer_user_id: conversation.buyerUserId,
    buyer: {
      id: conversation.buyerUserId,
      display_name: conversation.buyerDisplayName ?? null,
      avatar: conversation.buyerAvatar ?? null,
    },
    shop: {
      id: conversation.shopPublicId,
      owner_user_id: conversation.shopOwnerUserId,
      shop_name: conversation.shopName,
      slug: conversation.shopSlug,
    },
    status: conversation.status,
    last_message: conversation.lastMessageId && conversation.lastMessageAt && conversation.lastMessageSenderUserId
      ? {
        id: conversation.lastMessageId,
        body_preview: conversation.lastMessageBodyPreview ?? '',
        sender_user_id: conversation.lastMessageSenderUserId,
        message_type: conversation.lastMessageType ?? 'text',
        created_at: conversation.lastMessageAt,
      }
      : null,
    last_message_at: conversation.lastMessageAt ?? null,
    last_message_sender_user_id: conversation.lastMessageSenderUserId ?? null,
    buyer_last_read_at: conversation.buyerLastReadAt ?? null,
    seller_last_read_at: conversation.sellerLastReadAt ?? null,
    buyer_unread_count: conversation.buyerUnreadCount,
    seller_unread_count: conversation.sellerUnreadCount,
    created_at: conversation.createdAt,
    updated_at: conversation.updatedAt,
  };
}

export function toChatMessageResponse(message: ChatMessageSummary) {
  return {
    id: message.id,
    conversation_id: message.conversationPublicId,
    sender_user_id: message.senderUserId,
    body: message.body,
    message_type: message.messageType,
    metadata: message.metadata ?? null,
    edited_at: message.editedAt ?? null,
    created_at: message.createdAt,
    updated_at: message.updatedAt,
  };
}

export function toChatConversationListResponse(result: ChatConversationListResult) {
  return {
    results: result.results.map(toChatConversationResponse),
    page: result.page,
    limit: result.limit,
    total_pages: result.totalPages,
    total_results: result.totalResults,
  };
}

export function toChatMessageListResponse(result: ChatMessageListResult) {
  return {
    conversation: toChatConversationResponse(result.conversation),
    results: result.results.map(toChatMessageResponse),
    limit: result.limit,
    page_info: {
      has_more_before: result.pageInfo.hasMoreBefore,
      before_cursor: result.pageInfo.beforeCursor ?? null,
    },
  };
}
