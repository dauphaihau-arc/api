export function buildUserWsChannelKey(userId: string): string {
  return `user:${userId}`;
}

export function buildConversationWsChannelKey(conversationId: string): string {
  return `conversation:${conversationId}`;
}

export function buildShopWsChannelKey(shopId: string): string {
  return `shop:${shopId}`;
}
