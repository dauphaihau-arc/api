const CHAT_MESSAGE_BODY_PREVIEW_MAX_LENGTH = 160;

export function buildChatMessageBodyPreview(body: string): string {
  return body
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, CHAT_MESSAGE_BODY_PREVIEW_MAX_LENGTH);
}
