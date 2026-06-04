import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  toChatConversationSummary,
  toChatMessageSummary
} from '../../chat-read-model';
import type { ChatMessageListQuery, ChatMessageListResult } from '../../chat.types';
import { ChatConversationNotFoundError } from '../../errors/chat-app.error';
import { ChatConversationEntity } from '../../../infra/persistence/entities/chat-conversation.entity';
import { ChatMessageEntity } from '../../../infra/persistence/entities/chat-message.entity';

@Injectable()
export class GetShopChatMessagesUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(
    shopId: string,
    conversationId: string,
    query: ChatMessageListQuery
  ): Promise<ChatMessageListResult> {
    const entityManager = this.entityManager.fork();
    const conversation = await entityManager.getRepository(ChatConversationEntity).findOne(
      { id: conversationId, shop: shopId },
      { populate: ['buyerUser', 'shop.ownerUser', 'product'] }
    );

    if (!conversation) {
      throw new ChatConversationNotFoundError();
    }

    const messageRepository = entityManager.getRepository(ChatMessageEntity);
    const [messages, total] = await messageRepository.findAndCount(
      { conversation: conversation.id },
      {
        populate: ['conversation', 'senderUser'],
        orderBy: { createdAt: 'asc' },
        offset: (query.page - 1) * query.limit,
        limit: query.limit,
      }
    );

    return {
      conversation: toChatConversationSummary(conversation),
      results: messages.map(toChatMessageSummary),
      page: query.page,
      limit: query.limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      totalResults: total,
    };
  }
}
