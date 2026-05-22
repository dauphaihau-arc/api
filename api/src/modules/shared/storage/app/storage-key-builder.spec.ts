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
      assetPath: ['image-1'],
      extension: 'webp',
      filename: 'card_1x1',
    });

    expect(key).toBe(
      'prod/public/shops/shop-1/products/product-1/images/image-1/card_1x1.webp'
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
