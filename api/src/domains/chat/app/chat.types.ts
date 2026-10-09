export interface ChatConversationSummary {
  id: string;
  publicId: string;
  buyerUserId: string;
  buyerDisplayName?: string;
  buyerAvatar?: string;
  shopId: string;
  shopPublicId: string;
  shopName: string;
  shopSlug: string;
  shopOwnerUserId: string;
  status: string;
  lastMessageId?: string;
  lastMessageBodyPreview?: string;
  lastMessageType?: string;
  lastMessageAt?: Date;
  lastMessageSenderUserId?: string;
  buyerLastReadAt?: Date;
  sellerLastReadAt?: Date;
  buyerUnreadCount: number;
  sellerUnreadCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessageSummary {
  id: string;
  conversationId: string;
  conversationPublicId: string;
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
  limit: number;
  before?: string;
}

export interface ChatMessagePageInfo {
  hasMoreBefore: boolean;
  beforeCursor?: string;
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
  limit: number;
  pageInfo: ChatMessagePageInfo;
}
