import type { ConfigService } from '@nestjs/config';

export interface WebPushConfig {
  enabled: boolean;
  subject?: string;
  publicKey?: string;
  privateKey?: string;
  ttlSeconds: number;
}

export const WEB_PUSH_CONFIG = Symbol('WEB_PUSH_CONFIG');

export function buildWebPushConfig(
  configService: Pick<ConfigService, 'get'>,
): WebPushConfig {
  const subject = configService.get<string>('WEB_PUSH_SUBJECT')?.trim();
  const publicKey = configService.get<string>('WEB_PUSH_PUBLIC_KEY')?.trim();
  const privateKey = configService.get<string>('WEB_PUSH_PRIVATE_KEY')?.trim();

  return {
    enabled: Boolean(subject && publicKey && privateKey),
    subject: subject || undefined,
    publicKey: publicKey || undefined,
    privateKey: privateKey || undefined,
    ttlSeconds: Number(configService.get<string>('WEB_PUSH_TTL_SECONDS', '60')),
  };
}
