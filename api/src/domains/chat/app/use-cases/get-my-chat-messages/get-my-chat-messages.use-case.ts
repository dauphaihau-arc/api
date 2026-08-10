import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import type { ChatMessageListQuery, ChatMessageListResult } from '../../chat.types';
import { ChatConversationAccessDeniedError, ChatConversationNotFoundError } from '../../errors/chat-app.error';
import { ChatQueryRepository } from '../../ports/chat-query.repository';

@Injectable()
export class GetMyChatMessagesUseCase {
  constructor(
    @Inject(ChatQueryRepository)
    private readonly chatQueries: ChatQueryRepository,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    conversationId: string,
    query: ChatMessageListQuery,
  ): Promise<ChatMessageListResult> {
    const result = await this.chatQueries.listBuyerMessages(actor.userId, conversationId, query);

    if (result) {
      return result;
    }

    if (!await this.chatQueries.conversationExists(conversationId)) {
      throw new ChatConversationNotFoundError();
    }

    throw new ChatConversationAccessDeniedError();
  }
}
