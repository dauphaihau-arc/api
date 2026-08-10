import { ForwardChatMessageToWsListener } from './forward-chat-message-to-ws.listener';
import type { WsPublisher } from '~/platform/ws/infra/ws.publisher';

describe('ForwardChatMessageToWsListener', () => {
  it('fans out chat events to conversation, user, and shop channels', () => {
    const wsPublisher = {
      publishToChannels: jest.fn(),
    } as unknown as jest.Mocked<WsPublisher>;
    const listener = new ForwardChatMessageToWsListener(wsPublisher);

    listener.handle({
      conversation_id: 'conversation-1',
      message_id: 'message-1',
      sender_user_id: 'user-sender',
      recipient_user_ids: ['user-recipient', 'user-sender'],
      body: 'Hello there',
      message_type: 'text',
      shop_id: 'shop-1',
      occurred_at: '2026-06-03T12:00:00.000Z',
      metadata: { product_id: 'product-1' },
    });

    expect(wsPublisher.publishToChannels).toHaveBeenCalledTimes(1);
    expect(wsPublisher.publishToChannels).toHaveBeenCalledWith(
      [
        'conversation:conversation-1',
        'user:user-sender',
        'user:user-recipient',
        'shop:shop-1',
      ],
      {
        id: expect.any(String),
        type: 'message',
        payload: {
          event_type: 'chat.message.created',
          conversation_id: 'conversation-1',
          shop_id: 'shop-1',
          message: {
            id: 'message-1',
            body: 'Hello there',
            message_type: 'text',
            sender_user_id: 'user-sender',
            occurred_at: '2026-06-03T12:00:00.000Z',
            metadata: { product_id: 'product-1' },
          },
        },
      },
    );
  });
});
