import type { ConfigService } from '@nestjs/config';
import { parseDurationToMilliseconds } from '../libs/duration';

export interface RateLimitConfig {
  driver: 'memory' | 'redis';
  redisUrl: string;
  limit: number;
  ttlMilliseconds: number;
  blockDurationMilliseconds: number;
}

export const RATE_LIMIT_CONFIG = Symbol('RATE_LIMIT_CONFIG');

export function buildRateLimitConfig(
  configService: Pick<ConfigService, 'get'>
): RateLimitConfig {
  const ttlMilliseconds = parseDurationToMilliseconds(
    configService.get<string>('RATE_LIMIT_TTL', '60s'),
    60_000
  );
  const blockDurationMilliseconds = parseDurationToMilliseconds(
    configService.get<string>('RATE_LIMIT_BLOCK_DURATION'),
    ttlMilliseconds
  );
  const explicitDriver = configService.get<'memory' | 'redis'>(
    'RATE_LIMIT_DRIVER'
  );

  return {
    driver:
      explicitDriver ??
      (configService.get<string>('NODE_ENV') === 'test' ? 'memory' : 'redis'),
    redisUrl: configService.get<string>('REDIS_URL', 'redis://127.0.0.1:6379'),
    limit: Number(configService.get<string>('RATE_LIMIT_LIMIT', '20')),
    ttlMilliseconds,
    blockDurationMilliseconds,
  };
}
