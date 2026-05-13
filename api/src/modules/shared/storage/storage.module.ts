import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  STORAGE_CONFIG,
  buildStorageConfig
} from '../../../config/storage.config';
import { StorageService } from './app/ports/storage.service';
import { LocalFileStorageService } from './infra/local-file-storage.service';
import { MinioStorageService } from './infra/minio-storage.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: STORAGE_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildStorageConfig(configService),
    },
    {
      provide: StorageService,
      inject: [STORAGE_CONFIG],
      useFactory: (storageConfig: ReturnType<typeof buildStorageConfig>) =>
        storageConfig.driver === 'minio'
          ? new MinioStorageService(storageConfig)
          : new LocalFileStorageService(storageConfig),
    },
  ],
  exports: [STORAGE_CONFIG, StorageService],
})
export class StorageModule {}
