import { Inject, Injectable } from '@nestjs/common';
import type {
  ChatConversationListQuery,
  ChatConversationListResult,
} from '../../chat.types';
import { ChatQueryRepository } from '../../ports/chat-query.repository';

@Injectable()
export class ListShopChatConversationsUseCase {
  constructor(
    @Inject(ChatQueryRepository)
    private readonly chatQueries: ChatQueryRepository,
  ) {}

  async execute(
    shopId: string,
    query: ChatConversationListQuery,
  ): Promise<ChatConversationListResult> {
    return this.chatQueries.listShopConversations(shopId, query);
  }
}
