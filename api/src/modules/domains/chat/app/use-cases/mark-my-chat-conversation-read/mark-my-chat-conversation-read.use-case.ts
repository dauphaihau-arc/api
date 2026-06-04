import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { toChatConversationSummary } from '../../chat-read-model';
import type { ChatConversationSummary } from '../../chat.types';
import {
  ChatConversationAccessDeniedError,
  ChatConversationNotFoundError
} from '../../errors/chat-app.error';
import { ChatConversationEntity } from '../../../infra/persistence/entities/chat-conversation.entity';

@Injectable()
export class MarkMyChatConversationReadUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(
    actor: AuthenticatedUser,
    conversationId: string
  ): Promise<ChatConversationSummary> {
    const entityManager = this.entityManager.fork();
    const conversation = await entityManager.getRepository(ChatConversationEntity).findOne(
      { id: conversationId },
      { populate: ['buyerUser', 'shop.ownerUser', 'product', 'lastMessageSenderUser'] }
    );

    if (!conversation) {
      throw new ChatConversationNotFoundError();
    }

    if (conversation.buyerUser.id !== actor.userId) {
      throw new ChatConversationAccessDeniedError();
    }

    conversation.buyerLastReadAt = new Date();
    await entityManager.flush();

    return toChatConversationSummary(conversation);
  }
}
