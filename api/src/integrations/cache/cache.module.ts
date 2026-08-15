import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  buildCacheConfig,
  buildCacheModuleOptions,
} from '~/platform/config/cache.config';
import { OptionalCacheService } from './optional-cache.service';

@Module({
  imports: [
    ConfigModule,
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildCacheModuleOptions(buildCacheConfig(configService)),
    }),
  ],
  providers: [OptionalCacheService],
  exports: [NestCacheModule, OptionalCacheService],
})
export class CacheModule {}
