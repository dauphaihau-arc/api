import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { IdempotencyKeyInterceptor } from '~/platform/interceptors/idempotency-key.interceptor';
import { IDEMPOTENCY_REDIS } from '~/platform/interceptors/idempotency.constants';
import { buildCacheConfig } from '~/platform/config/cache.config';
import { CacheModule } from '~/integrations/cache/cache.module';

@Module({
  imports: [ConfigModule, CacheModule],
  providers: [
    {
      provide: IDEMPOTENCY_REDIS,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const cacheConfig = buildCacheConfig(configService);

        if (cacheConfig.driver !== 'redis') {
          return null;
        }

        const client = createClient({
          url: cacheConfig.redisUrl,
        });

        await client.connect();

        return client;
      },
    },
    IdempotencyKeyInterceptor,
  ],
  exports: [IDEMPOTENCY_REDIS, IdempotencyKeyInterceptor],
})
export class IdempotencyModule {}
