import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  toChatConversationSummary,
  toChatMessageSummary,
} from '../../chat-read-model';
import {
  decodeChatMessageCursor,
  encodeChatMessageCursor,
} from '../../chat-message-cursor';
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
    query: ChatMessageListQuery,
  ): Promise<ChatMessageListResult> {
    const entityManager = this.entityManager.fork();

    const conversation = await entityManager.getRepository(ChatConversationEntity).findOne(
      { id: conversationId, shop: shopId },
      { populate: ['buyerUser', 'shop.ownerUser', 'lastMessage', 'lastMessageSenderUser'] },
    );

    if (!conversation) {
      throw new ChatConversationNotFoundError();
    }

    const messageRepository = entityManager.getRepository(ChatMessageEntity);
    const cursor = query.before ? decodeChatMessageCursor(query.before) : undefined;

    const filters = cursor
      ? {
        conversation: conversation.id,
        $or: [
          { createdAt: { $lt: cursor.createdAt } },
          {
            createdAt: cursor.createdAt,
            id: { $lt: cursor.id },
          },
        ],
      }
      : { conversation: conversation.id };

    const messages = await messageRepository.find(
      filters,
      {
        populate: ['conversation', 'senderUser'],
        orderBy: { createdAt: 'desc', id: 'desc' },
        limit: query.limit + 1,
      },
    );

    const hasMoreBefore = messages.length > query.limit;
    const pageMessages = messages.slice(0, query.limit).reverse();
    const oldestMessage = pageMessages[0];

    return {
      conversation: toChatConversationSummary(conversation),
      results: pageMessages.map(toChatMessageSummary),
      limit: query.limit,
      pageInfo: {
        hasMoreBefore,
        beforeCursor: hasMoreBefore && oldestMessage
          ? encodeChatMessageCursor({
            createdAt: oldestMessage.createdAt,
            id: oldestMessage.id,
          })
          : undefined,
      },
    };
  }
}
