import { Inject, Injectable } from '@nestjs/common';
import type { ChatConversationSummary } from '../../chat.types';
import { ChatConversationNotFoundError } from '../../errors/chat-app.error';
import { ChatCommandRepository } from '../../ports/chat-command.repository';

@Injectable()
export class MarkShopChatConversationReadUseCase {
  constructor(
    @Inject(ChatCommandRepository)
    private readonly chatCommands: ChatCommandRepository,
  ) {}

  async execute(
    shopId: string,
    conversationId: string,
  ): Promise<ChatConversationSummary> {
    const conversation = await this.chatCommands.markShopConversationRead(shopId, conversationId);

    if (!conversation) {
      throw new ChatConversationNotFoundError();
    }

    return conversation;
  }
}
