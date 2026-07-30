export interface PutStorageObjectInput {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
}

export interface StoredObject {
  key: string;
  size: number;
  contentType?: string;
  url?: string;
}
