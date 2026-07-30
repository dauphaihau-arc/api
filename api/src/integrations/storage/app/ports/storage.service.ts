import type { PutStorageObjectInput, StoredObject } from '../storage.types';

export abstract class StorageService {
  abstract putObject(input: PutStorageObjectInput): Promise<StoredObject>;
  abstract getObject(key: string): Promise<Buffer>;
  abstract deleteObject(key: string): Promise<void>;
  abstract exists(key: string): Promise<boolean>;
  abstract getPublicUrl(key: string): string | undefined;
  abstract ping(): Promise<void>;
}
