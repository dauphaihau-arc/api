import { randomBytes } from 'node:crypto';

const PUBLIC_ID_BYTES = 6;

export function createPublicId(): string {
  return randomBytes(PUBLIC_ID_BYTES).toString('hex');
}
