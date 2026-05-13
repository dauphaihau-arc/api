export function buildUserByIdCacheKey(id: string): string {
  return `users:${id}`;
}
