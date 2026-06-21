import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  buildConversationWsChannelKey,
  buildShopWsChannelKey,
  buildUserWsChannelKey,
} from '~/modules/shared/ws/app/channel-keys';
import { WsPublisher } from '~/modules/shared/ws/infra/ws.publisher';
import {
  CHAT_MESSAGE_CREATED_EVENT,
  type ChatMessageCreatedEventPayload,
} from '../app/events/chat-message-created.event';

@Injectable()
export class ForwardChatMessageToWsListener {
  constructor(private readonly wsPublisher: WsPublisher) {}

  @OnEvent(CHAT_MESSAGE_CREATED_EVENT, { async: true, suppressErrors: true })
  handle(payload: ChatMessageCreatedEventPayload): void {
    const userIds = new Set([
      payload.sender_user_id,
      ...payload.recipient_user_ids,
    ]);
    const channelKeys = [
      buildConversationWsChannelKey(payload.conversation_id),
      ...Array.from(userIds, userId => buildUserWsChannelKey(userId)),
      ...(payload.shop_id ? [buildShopWsChannelKey(payload.shop_id)] : []),
    ];

    this.wsPublisher.publishToChannels(channelKeys, {
      id: randomUUID(),
      type: 'message',
      payload: {
        event_type: 'chat.message.created',
        conversation_id: payload.conversation_id,
        shop_id: payload.shop_id ?? null,
        message: {
          id: payload.message_id,
          body: payload.body,
          sender_user_id: payload.sender_user_id,
          occurred_at: payload.occurred_at ?? new Date().toISOString(),
          metadata: payload.metadata ?? null,
        },
      },
    });
  }
}
