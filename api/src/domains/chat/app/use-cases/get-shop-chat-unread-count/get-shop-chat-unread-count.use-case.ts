import { Inject, Injectable } from '@nestjs/common';
import { ChatQueryRepository } from '../../ports/chat-query.repository';

@Injectable()
export class GetShopChatUnreadCountUseCase {
  constructor(
    @Inject(ChatQueryRepository)
    private readonly chatQueries: ChatQueryRepository,
  ) {}

  async execute(shopId: string): Promise<number> {
    return this.chatQueries.countShopUnreadConversations(shopId);
  }
}
