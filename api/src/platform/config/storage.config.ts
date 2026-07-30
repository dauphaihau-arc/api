import type { ConfigService } from '@nestjs/config';

export interface LocalStorageConfig {
  driver: 'local';
  localRoot: string;
  publicBaseUrl?: string;
}

export interface MinioStorageConfig {
  driver: 'minio';
  publicBaseUrl?: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
}

export type StorageConfig = LocalStorageConfig | MinioStorageConfig;

export const STORAGE_CONFIG = Symbol('STORAGE_CONFIG');

export function buildStorageConfig(
  configService: Pick<ConfigService, 'get'>,
): StorageConfig {
  const driver = configService.get<'local' | 'minio'>(
    'STORAGE_DRIVER',
    'local',
  ) ?? 'local';

  if (driver === 'minio') {
    const endpoint = configService.get<string>(
      'STORAGE_OBJECT_STORAGE_ENDPOINT',
    ) ?? configService.get<string>('STORAGE_MINIO_ENDPOINT', '');
    const region = configService.get<string>(
      'STORAGE_OBJECT_STORAGE_REGION',
    ) ?? configService.get<string>('STORAGE_MINIO_REGION', 'us-east-1');
    const bucket = configService.get<string>(
      'STORAGE_OBJECT_STORAGE_BUCKET',
    ) ?? configService.get<string>('STORAGE_MINIO_BUCKET', '');
    const accessKey = configService.get<string>(
      'STORAGE_OBJECT_STORAGE_ACCESS_KEY',
    ) ?? configService.get<string>('STORAGE_MINIO_ACCESS_KEY', '');
    const secretKey = configService.get<string>(
      'STORAGE_OBJECT_STORAGE_SECRET_KEY',
    ) ?? configService.get<string>('STORAGE_MINIO_SECRET_KEY', '');
    const forcePathStyleValue = configService.get<string>(
      'STORAGE_OBJECT_STORAGE_FORCE_PATH_STYLE',
    ) ?? configService.get<string>('STORAGE_MINIO_FORCE_PATH_STYLE', 'true');

    return {
      driver,
      publicBaseUrl: configService.get<string>('STORAGE_PUBLIC_BASE_URL'),
      endpoint,
      region,
      bucket,
      accessKey,
      secretKey,
      forcePathStyle: forcePathStyleValue === 'true',
    };
  }

  return {
    driver,
    localRoot: configService.get<string>('STORAGE_LOCAL_ROOT', './storage'),
    publicBaseUrl: configService.get<string>('STORAGE_PUBLIC_BASE_URL'),
  };
}
