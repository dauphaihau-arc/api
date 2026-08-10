import { Buffer } from 'node:buffer';

export type ChatMessageCursor = {
  createdAt: Date;
  id: string;
};

export function encodeChatMessageCursor(input: ChatMessageCursor): string {
  return Buffer
    .from(JSON.stringify({
      created_at: input.createdAt.toISOString(),
      id: input.id,
    }))
    .toString('base64url');
}

export function decodeChatMessageCursor(cursor: string): ChatMessageCursor | undefined {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      created_at?: unknown;
      id?: unknown;
    };

    if (typeof parsed.created_at !== 'string' || typeof parsed.id !== 'string') {
      return undefined;
    }

    const createdAt = new Date(parsed.created_at);

    if (Number.isNaN(createdAt.getTime())) {
      return undefined;
    }

    return {
      createdAt,
      id: parsed.id,
    };
  }
  catch {
    return undefined;
  }
}
