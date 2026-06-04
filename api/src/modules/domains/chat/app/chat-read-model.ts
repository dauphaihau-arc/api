import type { ChatConversationEntity } from '../infra/persistence/entities/chat-conversation.entity';
import type { ChatMessageEntity } from '../infra/persistence/entities/chat-message.entity';
import type {
  ChatConversationSummary,
  ChatMessageSummary
} from './chat.types';

export function toChatConversationSummary(
  conversation: ChatConversationEntity
): ChatConversationSummary {
  return {
    id: conversation.id,
    buyerUserId: conversation.buyerUser.id,
    shopId: conversation.shop.id,
    shopName: conversation.shop.shopName,
    shopSlug: conversation.shop.slug,
    shopOwnerUserId: conversation.shop.ownerUser.id,
    productId: conversation.product?.id,
    productTitle: conversation.product?.title,
    productSlug: conversation.product?.slug,
    status: conversation.status,
    lastMessageAt: conversation.lastMessageAt,
    lastMessageSenderUserId: conversation.lastMessageSenderUser?.id,
    buyerLastReadAt: conversation.buyerLastReadAt,
    sellerLastReadAt: conversation.sellerLastReadAt,
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
