import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  ENCRYPTION_CONFIG,
  buildEncryptionConfig,
} from '~/platform/config/encryption.config';
import { FieldEncryptionService } from './field-encryption.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: ENCRYPTION_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildEncryptionConfig(configService),
    },
    FieldEncryptionService,
  ],
  exports: [ENCRYPTION_CONFIG, FieldEncryptionService],
})
export class CryptoModule {}
