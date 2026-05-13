export function normalizeStorageKey(key: string): string {
  const trimmedKey = key.trim();

  if (trimmedKey.length === 0) {
    throw new Error('Storage key is required.');
  }

  if (trimmedKey.startsWith('/')) {
    throw new Error('Storage key must be relative.');
  }

  const segments = trimmedKey.split('/');

  for (const segment of segments) {
    if (segment.length === 0 || segment === '.' || segment === '..') {
      throw new Error(
        `Storage key "${key}" contains an invalid path segment.`
      );
    }
  }

  return segments.join('/');
}
