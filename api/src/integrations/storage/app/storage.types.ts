import type { Readable } from 'node:stream';

export interface PutStorageObjectInput {
  key: string;
  body: Buffer | Uint8Array | string | Readable;
  contentType?: string;
  contentLength?: number;
}

export interface StoredObject {
  key: string;
  size: number;
  contentType?: string;
  url?: string;
}
