import { Inject, Injectable } from '@nestjs/common';
import type { ChatMessageListQuery, ChatMessageListResult } from '../../chat.types';
import { ChatConversationNotFoundError } from '../../errors/chat-app.error';
import { ChatQueryRepository } from '../../ports/chat-query.repository';

@Injectable()
export class GetShopChatMessagesUseCase {
  constructor(
    @Inject(ChatQueryRepository)
    private readonly chatQueries: ChatQueryRepository,
  ) {}

  async execute(
    shopId: string,
    conversationId: string,
    query: ChatMessageListQuery,
  ): Promise<ChatMessageListResult> {
    const result = await this.chatQueries.listShopMessages(shopId, conversationId, query);

    if (!result) {
      throw new ChatConversationNotFoundError();
    }

    return result;
  }
}
