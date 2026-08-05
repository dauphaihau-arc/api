import {
  buildStorageObjectKey,
  resolveImageExtension,
  resolveStorageEnvironmentSegment,
} from './storage-key-builder';

describe('storage key builder', () => {
  it('builds a structured storage object key from path segments', () => {
    const key = buildStorageObjectKey({
      env: 'production',
      visibility: 'public',
      pathSegments: ['scope-a', 'entity-1', 'files', 'asset-1'],
      extension: 'webp',
      filename: 'card_1x1',
    });

    expect(key).toBe(
      'prod/public/scope-a/entity-1/files/asset-1/card_1x1.webp',
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
