import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  buildCacheConfig,
  buildCacheModuleOptions,
} from '~/config/cache.config';

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
  exports: [NestCacheModule],
})
export class CacheModule {}
