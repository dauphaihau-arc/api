import {
  buildStorageObjectKey,
  resolveImageExtension,
  resolveStorageEnvironmentSegment
} from './storage-key-builder';

describe('storage key builder', () => {
  it('builds a structured product image storage key', () => {
    const key = buildStorageObjectKey({
      env: 'production',
      visibility: 'public',
      path: [
        { domain: 'shops', id: 'shop-1' },
        { domain: 'products', id: 'product-1' },
      ],
      collection: 'images',
      assetType: 'original',
      extension: 'webp',
      filename: 'asset-1',
    });

    expect(key).toBe(
      'prod/public/shops/shop-1/products/product-1/images/original/asset-1.webp'
    );
  });

  it('normalizes runtime environment names', () => {
    expect(resolveStorageEnvironmentSegment('development')).toBe('dev');
    expect(resolveStorageEnvironmentSegment('production')).toBe('prod');
    expect(resolveStorageEnvironmentSegment('test')).toBe('test');
  });

  it('maps supported image content types to extensions', () => {
    expect(resolveImageExtension('image/jpeg')).toBe('jpg');
    expect(resolveImageExtension('image/png')).toBe('png');
    expect(resolveImageExtension('image/webp')).toBe('webp');
  });
});
