import type {
  ChatConversationListQuery,
  ChatConversationListResult,
  ChatMessageListQuery,
  ChatMessageListResult,
} from '../chat.types';

export abstract class ChatQueryRepository {
  abstract listBuyerConversations(
    buyerUserId: string,
    query: ChatConversationListQuery
  ): Promise<ChatConversationListResult>;

  abstract listShopConversations(
    shopId: string,
    query: ChatConversationListQuery
  ): Promise<ChatConversationListResult>;

  abstract countBuyerUnreadConversations(buyerUserId: string): Promise<number>;

  abstract countShopUnreadConversations(shopId: string): Promise<number>;

  abstract conversationExists(conversationId: string): Promise<boolean>;

  abstract listBuyerMessages(
    buyerUserId: string,
    conversationId: string,
    query: ChatMessageListQuery
  ): Promise<ChatMessageListResult | null>;

  abstract listShopMessages(
    shopId: string,
    conversationId: string,
    query: ChatMessageListQuery
  ): Promise<ChatMessageListResult | null>;
}
