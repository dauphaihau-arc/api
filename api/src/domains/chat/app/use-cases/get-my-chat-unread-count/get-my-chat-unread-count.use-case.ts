import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ChatQueryRepository } from '../../ports/chat-query.repository';

@Injectable()
export class GetMyChatUnreadCountUseCase {
  constructor(
    @Inject(ChatQueryRepository)
    private readonly chatQueries: ChatQueryRepository,
  ) {}

  async execute(actor: AuthenticatedUser): Promise<number> {
    return this.chatQueries.countBuyerUnreadConversations(actor.userId);
  }
}
