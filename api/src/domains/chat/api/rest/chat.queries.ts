import {
  CHAT_LIST_DEFAULT_LIMIT,
  CHAT_LIST_DEFAULT_PAGE,
  CHAT_MESSAGE_LIST_DEFAULT_LIMIT,
} from './chat.constants';
import type { ChatConversationListQuery, ChatMessageListQuery } from '../../app/chat.types';

export function buildChatConversationListQuery(
  input?: Partial<ChatConversationListQuery>,
): ChatConversationListQuery {
  return {
    page: input?.page ?? CHAT_LIST_DEFAULT_PAGE,
    limit: input?.limit ?? CHAT_LIST_DEFAULT_LIMIT,
  };
}

export function buildChatMessageListQuery(
  input?: Partial<ChatMessageListQuery>,
): ChatMessageListQuery {
  return {
    limit: input?.limit ?? CHAT_MESSAGE_LIST_DEFAULT_LIMIT,
    before: input?.before,
  };
}
