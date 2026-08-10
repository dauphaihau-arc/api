import type {
  ChatConversationListResult,
  ChatConversationSummary,
  ChatMessageListResult,
  ChatMessageSummary,
} from '../../app/chat.types';

export function toChatConversationResponse(conversation: ChatConversationSummary) {
  return {
    id: conversation.id,
    buyer_user_id: conversation.buyerUserId,
    buyer: {
      id: conversation.buyerUserId,
      display_name: conversation.buyerDisplayName ?? null,
      avatar: conversation.buyerAvatar ?? null,
    },
    shop: {
      id: conversation.shopId,
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
    conversation_id: message.conversationId,
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
