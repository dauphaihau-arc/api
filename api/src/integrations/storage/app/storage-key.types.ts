export type StorageVisibility = 'public' | 'private';

export type StorageObjectKeySegment = string;

export interface BuildStorageObjectKeyInput {
  env: string;
  visibility: StorageVisibility;
  pathSegments: StorageObjectKeySegment[];
  extension: string;
  filename: string;
}
