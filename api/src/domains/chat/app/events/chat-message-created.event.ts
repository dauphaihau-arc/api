export const CHAT_MESSAGE_CREATED_EVENT = 'chat.message.created';

export type ChatMessageCreatedEventPayload = {
  conversation_id: string;
  message_id: string;
  sender_user_id: string;
  recipient_user_ids: string[];
  body: string;
  message_type: string;
  shop_id?: string;
  occurred_at?: string;
  metadata?: Record<string, unknown>;
};
