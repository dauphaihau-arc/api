export type StorageVisibility = 'public' | 'private';

export type StoragePathDomain = 'shops' | 'products' | 'categories';

export type StorageCollection = 'images';

export type StorageAssetType = 'original' | 'thumbnail' | 'medium' | 'large';

export interface StoragePathNode {
  domain: StoragePathDomain;
  id: string;
}

export interface BuildStorageObjectKeyInput {
  env: string;
  visibility: StorageVisibility;
  path: StoragePathNode[];
  collection: StorageCollection;
  assetType: StorageAssetType;
  extension: string;
  filename?: string;
}
