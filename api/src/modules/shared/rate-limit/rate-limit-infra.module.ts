import {
  ThrottlerStorage,
  ThrottlerStorageService
} from '@nestjs/throttler';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import {
  RATE_LIMIT_CONFIG,
  buildRateLimitConfig
} from '../../../config/rate-limit.config';
import { RedisRateLimitStorage } from './infra/redis-rate-limit.storage';
import { RATE_LIMIT_STORAGE } from './rate-limit.constants';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: RATE_LIMIT_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildRateLimitConfig(configService),
    },
    {
      provide: RATE_LIMIT_STORAGE,
      inject: [RATE_LIMIT_CONFIG],
      useFactory: async (
        rateLimitConfig: ReturnType<typeof buildRateLimitConfig>
      ): Promise<ThrottlerStorage> => {
        if (rateLimitConfig.driver === 'memory') {
          return new ThrottlerStorageService();
        }

        const client = createClient({
          url: rateLimitConfig.redisUrl,
        });

        await client.connect();

        return new RedisRateLimitStorage(client);
      },
    },
  ],
  exports: [RATE_LIMIT_CONFIG, RATE_LIMIT_STORAGE],
})
export class RateLimitInfraModule {}
