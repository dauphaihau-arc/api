import type { Request } from 'express';

export async function readRawBody(request: Request): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
      continue;
    }

    if (typeof chunk === 'string' || chunk instanceof Uint8Array) {
      chunks.push(Buffer.from(chunk));
      continue;
    }

    throw new TypeError('Unexpected request body chunk type');
  }

  return Buffer.concat(chunks);
}
