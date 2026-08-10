import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import type {
  ChatConversationListQuery,
  ChatConversationListResult,
} from '../../chat.types';
import { ChatQueryRepository } from '../../ports/chat-query.repository';

@Injectable()
export class ListMyChatConversationsUseCase {
  constructor(
    @Inject(ChatQueryRepository)
    private readonly chatQueries: ChatQueryRepository,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    query: ChatConversationListQuery,
  ): Promise<ChatConversationListResult> {
    return this.chatQueries.listBuyerConversations(actor.userId, query);
  }
}
