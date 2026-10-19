import type { ConfigService } from '@nestjs/config';

export interface EncryptionConfig {
  fieldEncryptionKey?: string;
}

export const ENCRYPTION_CONFIG = Symbol('ENCRYPTION_CONFIG');

export function buildEncryptionConfig(
  configService: Pick<ConfigService, 'get'>,
): EncryptionConfig {
  return {
    fieldEncryptionKey: configService.get<string>('FIELD_ENCRYPTION_KEY'),
  };
}
