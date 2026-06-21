import type { ThrottlerStorage } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import type { RedisClientType } from 'redis';

type RateLimitRedisClient = Pick<RedisClientType, 'eval' | 'isOpen' | 'quit'>;

const incrementRateLimitScript = `
local hitsKey = KEYS[1]
local blockKey = KEYS[2]

local now = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local blockDuration = tonumber(ARGV[4])
local requestId = ARGV[5]

redis.call('ZREMRANGEBYSCORE', hitsKey, 0, now - ttl)

local blockTtl = redis.call('PTTL', blockKey)
if blockTtl > 0 then
  return {
    redis.call('ZCARD', hitsKey),
    math.max(redis.call('PTTL', hitsKey), 0),
    1,
    blockTtl
  }
end

redis.call('ZADD', hitsKey, now, requestId)
redis.call('PEXPIRE', hitsKey, ttl)

local totalHits = redis.call('ZCARD', hitsKey)
local timeToExpire = math.max(redis.call('PTTL', hitsKey), 0)

if totalHits > limit then
  redis.call('SET', blockKey, '1', 'PX', blockDuration)
  redis.call('DEL', hitsKey)

  return {
    totalHits,
    0,
    1,
    blockDuration
  }
end

return {
  totalHits,
  timeToExpire,
  0,
  0
}
`;

export class RedisRateLimitStorage implements ThrottlerStorage {
  constructor(private readonly client: RateLimitRedisClient) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ) {
    const result = (await this.client.eval(incrementRateLimitScript, {
      keys: [
        this.buildStorageKey(throttlerName, key, 'hits'),
        this.buildStorageKey(throttlerName, key, 'blocked'),
      ],
      arguments: [
        String(Date.now()),
        String(ttl),
        String(limit),
        String(blockDuration),
        randomUUID(),
      ],
    })) as number[];

    const [totalHits, timeToExpireMs, isBlocked, timeToBlockExpireMs] = result;

    return {
      totalHits,
      timeToExpire: Math.ceil(timeToExpireMs / 1000),
      isBlocked: isBlocked === 1,
      timeToBlockExpire: Math.ceil(timeToBlockExpireMs / 1000),
    };
  }

  async onApplicationShutdown() {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  private buildStorageKey(
    throttlerName: string,
    key: string,
    suffix: 'blocked' | 'hits',
  ) {
    return `rate-limit:${throttlerName}:${key}:${suffix}`;
  }
}
