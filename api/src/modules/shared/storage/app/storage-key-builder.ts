import type { BuildStorageObjectKeyInput } from './storage-key.types';

export function buildStorageObjectKey(
  input: BuildStorageObjectKeyInput
): string {
  const env = resolveStorageEnvironmentSegment(input.env);
  const extension = normalizeExtension(input.extension);
  const filename = input.filename.trim().replace(/\.+/g, '');

  if (input.path.length === 0) {
    throw new Error('Storage path must include at least one domain node.');
  }

  if (input.assetPath.length === 0) {
    throw new Error('Storage asset path must include at least one segment.');
  }

  const pathSegments = input.path.flatMap((node) => {
    const id = node.id.trim();

    if (!id) {
      throw new Error(`Storage path node "${node.domain}" is missing an id.`);
    }

    return [node.domain, id];
  });

  return [
    env,
    input.visibility,
    ...pathSegments,
    input.collection,
    ...input.assetPath.map((segment) => segment.trim()).filter(Boolean),
    `${filename}.${extension}`,
  ].join('/');
}

export function resolveStorageEnvironmentSegment(
  nodeEnv?: string
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
