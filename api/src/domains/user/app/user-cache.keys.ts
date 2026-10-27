export function buildUserByIdCacheKey(id: string): string {
  return `users:v2:${id}`;
}
