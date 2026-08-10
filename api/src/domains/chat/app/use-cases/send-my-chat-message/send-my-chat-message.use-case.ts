import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import type { ChatMessageSummary } from '../../chat.types';
import { ChatConversationAccessDeniedError, ChatConversationNotFoundError } from '../../errors/chat-app.error';
import {
  CHAT_MESSAGE_CREATED_EVENT,
  type ChatMessageCreatedEventPayload,
} from '../../events/chat-message-created.event';
import { ChatCommandRepository } from '../../ports/chat-command.repository';

@Injectable()
export class SendMyChatMessageUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    @Inject(ChatCommandRepository)
    private readonly chatCommands: ChatCommandRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    conversationId: string,
    input: {
      body: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<ChatMessageSummary> {
    const { summary, eventPayload } = await this.entityManager.fork().transactional(async (entityManager) => {
      const conversation = await this.chatCommands.loadConversationForBuyerMessage(entityManager, conversationId);

      if (!conversation) {
        throw new ChatConversationNotFoundError();
      }

      if (conversation.buyerUser.id !== actor.userId) {
        throw new ChatConversationAccessDeniedError();
      }

      const message = this.chatCommands.addBuyerMessage(entityManager, conversation, {
        senderUserId: actor.userId,
        body: input.body,
        metadata: input.metadata,
      });

      await entityManager.flush();

      return {
        summary: await this.chatCommands.populateMessageSummary(entityManager, message),
        eventPayload: {
          conversation_id: conversation.id,
          message_id: message.id,
          sender_user_id: actor.userId,
          recipient_user_ids: [conversation.shop.ownerUser.id],
          body: message.body,
          message_type: message.messageType,
          shop_id: conversation.shop.id,
          occurred_at: message.createdAt.toISOString(),
          metadata: input.metadata,
        } satisfies ChatMessageCreatedEventPayload,
      };
    });

    this.eventEmitter.emit(CHAT_MESSAGE_CREATED_EVENT, eventPayload);

    return summary;
  }
}
