import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { toChatConversationSummary } from '../../chat-read-model';
import type { ChatConversationSummary } from '../../chat.types';
import { ChatConversationNotFoundError } from '../../errors/chat-app.error';
import { ChatConversationEntity } from '../../../infra/persistence/entities/chat-conversation.entity';

@Injectable()
export class MarkShopChatConversationReadUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(
    shopId: string,
    conversationId: string,
  ): Promise<ChatConversationSummary> {
    const entityManager = this.entityManager.fork();
    const conversation = await entityManager.getRepository(ChatConversationEntity).findOne(
      { id: conversationId, shop: shopId },
      { populate: ['buyerUser', 'shop.ownerUser', 'lastMessage', 'lastMessageSenderUser'] },
    );

    if (!conversation) {
      throw new ChatConversationNotFoundError();
    }

    conversation.sellerLastReadAt = new Date();
    conversation.sellerUnreadCount = 0;
    await entityManager.flush();

    return toChatConversationSummary(conversation);
  }
}
