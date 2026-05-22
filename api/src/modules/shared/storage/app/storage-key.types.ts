export type StorageVisibility = 'public' | 'private';

export type StoragePathDomain = 'shops' | 'products' | 'categories' | 'users';

export type StorageCollection = 'images';

export type StorageAssetPath = string[];

export interface StoragePathNode {
  domain: StoragePathDomain;
  id: string;
}

export interface BuildStorageObjectKeyInput {
  env: string;
  visibility: StorageVisibility;
  path: StoragePathNode[];
  collection: StorageCollection;
  assetPath: StorageAssetPath;
  extension: string;
  filename: string;
}
