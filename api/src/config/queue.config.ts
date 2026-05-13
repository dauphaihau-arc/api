import type { ConfigService } from '@nestjs/config';
import { parseDurationToMilliseconds } from '../libs/duration';

export interface QueueConfig {
  driver: 'inline' | 'redis';
  queueName: string;
  prefix: string;
  redisUrl: string;
  defaultAttempts: number;
  defaultBackoffMilliseconds: number;
  removeCompletedAfterSeconds: number;
  removeFailedAfterSeconds: number;
  workerConcurrency: number;
}

export const QUEUE_CONFIG = Symbol('QUEUE_CONFIG');

export function buildQueueConfig(
  configService: Pick<ConfigService, 'get'>
): QueueConfig {
  const explicitDriver = configService.get<'inline' | 'redis'>('QUEUE_DRIVER');

  return {
    driver:
      explicitDriver ??
      (configService.get<string>('NODE_ENV') === 'test' ? 'inline' : 'redis'),
    queueName: configService.get<string>('QUEUE_NAME', 'default'),
    prefix: configService.get<string>('QUEUE_PREFIX', 'nest-template'),
    redisUrl: configService.get<string>(
      'QUEUE_REDIS_URL',
      configService.get<string>('REDIS_URL', 'redis://127.0.0.1:6379')
    ),
    defaultAttempts: Number(
      configService.get<string>('QUEUE_JOB_ATTEMPTS', '5')
    ),
    defaultBackoffMilliseconds: parseDurationToMilliseconds(
      configService.get<string>('QUEUE_JOB_BACKOFF', '5s'),
      5_000
    ),
    removeCompletedAfterSeconds: Math.max(
      0,
      Math.ceil(
        parseDurationToMilliseconds(
          configService.get<string>('QUEUE_REMOVE_COMPLETED_AFTER', '1d'),
          24 * 60 * 60 * 1_000
        ) / 1_000
      )
    ),
    removeFailedAfterSeconds: Math.max(
      0,
      Math.ceil(
        parseDurationToMilliseconds(
          configService.get<string>('QUEUE_REMOVE_FAILED_AFTER', '7d'),
          7 * 24 * 60 * 60 * 1_000
        ) / 1_000
      )
    ),
    workerConcurrency: Number(
      configService.get<string>('QUEUE_WORKER_CONCURRENCY', '10')
    ),
  };
}
