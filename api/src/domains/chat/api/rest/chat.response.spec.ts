import type { ChatConversationSummary, ChatMessageSummary } from '../../app/chat.types';
import { toChatConversationResponse, toChatMessageResponse } from './chat.response';

const timestamp = new Date('2026-10-08T00:00:00.000Z');

describe('chat responses', () => {
  it('exposes conversation and nested shop public ids', () => {
    const conversation: ChatConversationSummary = {
      id: 'conversation-internal-1',
      publicId: 'cnv_1',
      buyerUserId: 'user-buyer',
      shopId: 'shop-internal-1',
      shopPublicId: 'shop_1',
      shopName: 'Clay House',
      shopSlug: 'clay-house',
      shopOwnerUserId: 'user-seller',
      status: 'open',
      buyerUnreadCount: 0,
      sellerUnreadCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const response = toChatConversationResponse(conversation);

    expect(response.id).toBe('cnv_1');
    expect(response.shop.id).toBe('shop_1');
    expect(response).not.toHaveProperty('public_id');
  });

  it('exposes the conversation public id on messages', () => {
    const message: ChatMessageSummary = {
      id: 'message-1',
      conversationId: 'conversation-internal-1',
      conversationPublicId: 'cnv_1',
      senderUserId: 'user-buyer',
      body: 'Hello',
      messageType: 'text',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    expect(toChatMessageResponse(message)).toMatchObject({
      id: 'message-1',
      conversation_id: 'cnv_1',
    });
  });
});
