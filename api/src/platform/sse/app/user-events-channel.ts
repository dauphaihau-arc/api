export function buildUserEventsChannelKey(userId: string): string {
  return `user:${userId}:events`;
}
