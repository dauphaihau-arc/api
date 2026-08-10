import type { ChatConversationEntity } from '../infra/persistence/entities/chat-conversation.entity';
import type { ChatMessageEntity } from '../infra/persistence/entities/chat-message.entity';
import type {
  ChatConversationSummary,
  ChatMessageSummary,
} from './chat.types';

export function toChatConversationSummary(
  conversation: ChatConversationEntity,
): ChatConversationSummary {
  return {
    id: conversation.id,
    buyerUserId: conversation.buyerUser.id,
    buyerDisplayName: conversation.buyerUser.displayName,
    buyerAvatar: conversation.buyerUser.avatar,
    shopId: conversation.shop.id,
    shopName: conversation.shop.shopName,
    shopSlug: conversation.shop.slug,
    shopOwnerUserId: conversation.shop.ownerUser.id,
    status: conversation.status,
    lastMessageId: conversation.lastMessage?.id,
    lastMessageBodyPreview: conversation.lastMessageBodyPreview,
    lastMessageType: conversation.lastMessageType,
    lastMessageAt: conversation.lastMessageAt,
    lastMessageSenderUserId: conversation.lastMessageSenderUser?.id,
    buyerLastReadAt: conversation.buyerLastReadAt,
    sellerLastReadAt: conversation.sellerLastReadAt,
    buyerUnreadCount: conversation.buyerUnreadCount,
    sellerUnreadCount: conversation.sellerUnreadCount,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

export function toChatMessageSummary(message: ChatMessageEntity): ChatMessageSummary {
  return {
    id: message.id,
    conversationId: message.conversation.id,
    senderUserId: message.senderUser.id,
    body: message.body,
    messageType: message.messageType,
    metadata: message.metadata,
    editedAt: message.editedAt,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };
}
