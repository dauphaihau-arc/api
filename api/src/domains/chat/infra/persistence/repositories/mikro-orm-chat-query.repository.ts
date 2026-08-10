import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  decodeChatMessageCursor,
  encodeChatMessageCursor,
} from '../../../app/chat-message-cursor';
import {
  toChatConversationSummary,
  toChatMessageSummary,
} from '../../../app/chat-read-model';
import type {
  ChatConversationListQuery,
  ChatConversationListResult,
  ChatMessageListQuery,
  ChatMessageListResult,
} from '../../../app/chat.types';
import { ChatQueryRepository } from '../../../app/ports/chat-query.repository';
import { ChatConversationEntity } from '../entities/chat-conversation.entity';
import { ChatMessageEntity } from '../entities/chat-message.entity';

const CHAT_CONVERSATION_SUMMARY_POPULATE = [
  'buyerUser',
  'shop.ownerUser',
  'lastMessage',
  'lastMessageSenderUser',
] as const;

@Injectable()
export class MikroOrmChatQueryRepository implements ChatQueryRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async listBuyerConversations(
    buyerUserId: string,
    query: ChatConversationListQuery,
  ): Promise<ChatConversationListResult> {
    const repository = this.entityManager.fork().getRepository(ChatConversationEntity);

    const [conversations, total] = await repository.findAndCount(
      { buyerUser: buyerUserId },
      {
        populate: CHAT_CONVERSATION_SUMMARY_POPULATE,
        orderBy: {
          lastMessageAt: 'desc',
          createdAt: 'desc',
        },
        offset: (query.page - 1) * query.limit,
        limit: query.limit,
      },
    );

    return buildConversationListResult(conversations, total, query);
  }

  async listShopConversations(
    shopId: string,
    query: ChatConversationListQuery,
  ): Promise<ChatConversationListResult> {
    const repository = this.entityManager.fork().getRepository(ChatConversationEntity);

    const [conversations, total] = await repository.findAndCount(
      { shop: shopId },
      {
        populate: CHAT_CONVERSATION_SUMMARY_POPULATE,
        orderBy: {
          lastMessageAt: 'desc',
          createdAt: 'desc',
        },
        offset: (query.page - 1) * query.limit,
        limit: query.limit,
      },
    );

    return buildConversationListResult(conversations, total, query);
  }

  countBuyerUnreadConversations(buyerUserId: string): Promise<number> {
    return this.entityManager.fork().getRepository(ChatConversationEntity).count({
      buyerUser: buyerUserId,
      buyerUnreadCount: { $gt: 0 },
    });
  }

  countShopUnreadConversations(shopId: string): Promise<number> {
    return this.entityManager.fork().getRepository(ChatConversationEntity).count({
      shop: shopId,
      sellerUnreadCount: { $gt: 0 },
    });
  }

  async conversationExists(conversationId: string): Promise<boolean> {
    const count = await this.entityManager.fork().getRepository(ChatConversationEntity).count({
      id: conversationId,
    });

    return count > 0;
  }

  async listBuyerMessages(
    buyerUserId: string,
    conversationId: string,
    query: ChatMessageListQuery,
  ): Promise<ChatMessageListResult | null> {
    const entityManager = this.entityManager.fork();

    const conversation = await entityManager.getRepository(ChatConversationEntity).findOne(
      { id: conversationId, buyerUser: buyerUserId },
      { populate: CHAT_CONVERSATION_SUMMARY_POPULATE },
    );

    if (!conversation) {
      return null;
    }

    return this.listConversationMessages(entityManager, conversation, query);
  }

  async listShopMessages(
    shopId: string,
    conversationId: string,
    query: ChatMessageListQuery,
  ): Promise<ChatMessageListResult | null> {
    const entityManager = this.entityManager.fork();
    const conversation = await entityManager.getRepository(ChatConversationEntity).findOne(
      { id: conversationId, shop: shopId },
      { populate: CHAT_CONVERSATION_SUMMARY_POPULATE },
    );

    if (!conversation) {
      return null;
    }

    return this.listConversationMessages(entityManager, conversation, query);
  }

  private async listConversationMessages(
    entityManager: EntityManager,
    conversation: ChatConversationEntity,
    query: ChatMessageListQuery,
  ): Promise<ChatMessageListResult> {
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

    const messages = await entityManager.getRepository(ChatMessageEntity).find(
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

function buildConversationListResult(
  conversations: ChatConversationEntity[],
  total: number,
  query: ChatConversationListQuery,
): ChatConversationListResult {
  return {
    results: conversations.map(toChatConversationSummary),
    page: query.page,
    limit: query.limit,
    totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
    totalResults: total,
  };
}
