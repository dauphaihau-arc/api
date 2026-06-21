export const CHAT_LIST_DEFAULT_PAGE = 1;
export const CHAT_LIST_DEFAULT_LIMIT = 20;
export const CHAT_LIST_MAX_LIMIT = 100;
export const CHAT_MESSAGE_LIST_DEFAULT_PAGE = 1;
export const CHAT_MESSAGE_LIST_DEFAULT_LIMIT = 50;
export const CHAT_MESSAGE_LIST_MAX_LIMIT = 100;

export interface ChatConversationSummary {
  id: string;
  buyerUserId: string;
  shopId: string;
  shopName: string;
  shopSlug: string;
  shopOwnerUserId: string;
  productId?: string;
  productTitle?: string;
  productSlug?: string;
  status: string;
  lastMessageAt?: Date;
  lastMessageSenderUserId?: string;
  buyerLastReadAt?: Date;
  sellerLastReadAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessageSummary {
  id: string;
  conversationId: string;
  senderUserId: string;
  body: string;
  messageType: string;
  metadata?: Record<string, unknown>;
  editedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatConversationListQuery {
  page: number;
  limit: number;
}

export interface ChatMessageListQuery {
  page: number;
  limit: number;
}

export interface ChatConversationListResult {
  results: ChatConversationSummary[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}

export interface ChatMessageListResult {
  conversation: ChatConversationSummary;
  results: ChatMessageSummary[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
}

export function buildChatConversationListQuery(
  input?: Partial<ChatConversationListQuery>,
): ChatConversationListQuery {
  return {
    page: input?.page ?? CHAT_LIST_DEFAULT_PAGE,
    limit: input?.limit ?? CHAT_LIST_DEFAULT_LIMIT,
  };
}

export function buildChatMessageListQuery(
  input?: Partial<ChatMessageListQuery>,
): ChatMessageListQuery {
  return {
    page: input?.page ?? CHAT_MESSAGE_LIST_DEFAULT_PAGE,
    limit: input?.limit ?? CHAT_MESSAGE_LIST_DEFAULT_LIMIT,
  };
}
