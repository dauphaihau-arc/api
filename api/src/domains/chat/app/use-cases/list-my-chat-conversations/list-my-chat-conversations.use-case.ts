import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { toChatConversationSummary } from '../../chat-read-model';
import type {
  ChatConversationListQuery,
  ChatConversationListResult,
} from '../../chat.types';
import { ChatConversationEntity } from '../../../infra/persistence/entities/chat-conversation.entity';

@Injectable()
export class ListMyChatConversationsUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(
    actor: AuthenticatedUser,
    query: ChatConversationListQuery,
  ): Promise<ChatConversationListResult> {
    const repository = this.entityManager.fork().getRepository(ChatConversationEntity);

    const [conversations, total] = await repository.findAndCount(
      { buyerUser: actor.userId },
      {
        populate: ['buyerUser', 'shop.ownerUser', 'product'],
        orderBy: {
          lastMessageAt: 'desc',
          createdAt: 'desc',
        },
        offset: (query.page - 1) * query.limit,
        limit: query.limit,
      },
    );

    return {
      results: conversations.map(toChatConversationSummary),
      page: query.page,
      limit: query.limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      totalResults: total,
    };
  }
}
