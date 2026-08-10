import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import type { ChatConversationSummary } from '../../chat.types';
import {
  ChatConversationAccessDeniedError,
  ChatConversationNotFoundError,
} from '../../errors/chat-app.error';
import { ChatCommandRepository } from '../../ports/chat-command.repository';

@Injectable()
export class MarkMyChatConversationReadUseCase {
  constructor(
    @Inject(ChatCommandRepository)
    private readonly chatCommands: ChatCommandRepository,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    conversationId: string,
  ): Promise<ChatConversationSummary> {
    const result = await this.chatCommands.markBuyerConversationRead(actor.userId, conversationId);

    if (result.status === 'not_found') {
      throw new ChatConversationNotFoundError();
    }

    if (result.status === 'access_denied') {
      throw new ChatConversationAccessDeniedError();
    }

    return result.conversation;
  }
}
