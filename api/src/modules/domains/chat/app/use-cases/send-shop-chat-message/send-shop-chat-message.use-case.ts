import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { CurrentUserEntity } from '~/modules/domains/auth/infra/persistence/entities/current-user.entity';
import { toChatMessageSummary } from '../../chat-read-model';
import type { ChatMessageSummary } from '../../chat.types';
import { ChatConversationNotFoundError } from '../../errors/chat-app.error';
import {
  CHAT_MESSAGE_CREATED_EVENT,
  type ChatMessageCreatedEventPayload
} from '../../events/chat-message-created.event';
import { ChatConversationEntity } from '../../../infra/persistence/entities/chat-conversation.entity';
import { ChatMessageEntity } from '../../../infra/persistence/entities/chat-message.entity';

@Injectable()
export class SendShopChatMessageUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async execute(
    actor: AuthenticatedUser,
    shopId: string,
    conversationId: string,
    input: {
      body: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<ChatMessageSummary> {
    const entityManager = this.entityManager.fork();

    const conversation = await entityManager.getRepository(ChatConversationEntity).findOne(
      { id: conversationId, shop: shopId },
      { populate: ['buyerUser', 'shop.ownerUser', 'product'] }
    );

    if (!conversation) {
      throw new ChatConversationNotFoundError();
    }

    const message = new ChatMessageEntity();
    message.conversation = conversation;
    message.senderUser = entityManager.getReference(CurrentUserEntity, actor.userId);
    message.body = input.body.trim();

    if (input.metadata) {
      message.metadata = input.metadata;
    }

    conversation.lastMessageAt = message.createdAt;
    conversation.lastMessageSenderUser = message.senderUser;
    conversation.sellerLastReadAt = message.createdAt;

    await entityManager.persistAndFlush(message);
    await entityManager.populate(message, ['conversation', 'senderUser']);

    this.eventEmitter.emit(
      CHAT_MESSAGE_CREATED_EVENT,
      {
        conversation_id: conversation.id,
        message_id: message.id,
        sender_user_id: actor.userId,
        recipient_user_ids: [conversation.buyerUser.id, conversation.shop.ownerUser.id],
        body: message.body,
        shop_id: conversation.shop.id,
        occurred_at: message.createdAt.toISOString(),
        metadata: input.metadata,
      } satisfies ChatMessageCreatedEventPayload
    );

    return toChatMessageSummary(message);
  }
}
