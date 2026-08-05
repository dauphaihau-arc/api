import type { BuildStorageObjectKeyInput } from './storage-key.types';

export function buildStorageObjectKey(
  input: BuildStorageObjectKeyInput,
): string {
  const env = resolveStorageEnvironmentSegment(input.env);
  const extension = normalizeExtension(input.extension);
  const filename = input.filename.trim().replace(/\.+/g, '');

  if (input.pathSegments.length === 0) {
    throw new Error('Storage object key must include at least one path segment.');
  }

  const pathSegments = input.pathSegments.map((segment) => {
    const normalized = segment.trim();

    if (!normalized) {
      throw new Error('Storage object key path segments must not be blank.');
    }

    return normalized;
  });

  return [
    env,
    input.visibility,
    ...pathSegments,
    `${filename}.${extension}`,
  ].join('/');
}

export function resolveStorageEnvironmentSegment(
  nodeEnv?: string,
): 'dev' | 'prod' | 'test' {
  switch ((nodeEnv ?? 'development').trim().toLowerCase()) {
    case 'production':
    case 'prod':
      return 'prod';
    case 'test':
      return 'test';
    default:
      return 'dev';
  }
}

export function resolveImageExtension(contentType: string): 'jpg' | 'png' | 'webp' {
  switch (contentType.trim().toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      throw new Error(`Unsupported image content type "${contentType}".`);
  }
}

function normalizeExtension(extension: string): string {
  const normalized = extension.trim().toLowerCase().replace(/^\./, '');

  if (!normalized) {
    throw new Error('Storage object extension is required.');
  }

  return normalized;
}
