import {
  decodeChatMessageCursor,
  encodeChatMessageCursor,
} from './chat-message-cursor';

describe('chat message cursor', () => {
  it('round trips message cursor fields', () => {
    const cursor = {
      createdAt: new Date('2026-08-09T12:00:00.000Z'),
      id: '88d2ed8a-7111-4a6d-a342-87799d893db6',
    };

    expect(decodeChatMessageCursor(encodeChatMessageCursor(cursor))).toEqual(cursor);
  });

  it('returns undefined for invalid cursors', () => {
    expect(decodeChatMessageCursor('not-a-cursor')).toBeUndefined();
  });
});
