import type { ConfigService } from '@nestjs/config';

export interface MailConfig {
  driver: 'logger' | 'resend';
  resendApiKey?: string;
  defaultFrom: {
    email: string;
    name?: string;
  };
}

export const MAIL_CONFIG = Symbol('MAIL_CONFIG');

export function buildMailConfig(
  configService: Pick<ConfigService, 'get'>
): MailConfig {
  return {
    driver:
      configService.get<'logger' | 'resend'>('MAIL_DRIVER', 'logger') ??
      'logger',
    resendApiKey: configService.get<string>('RESEND_API_KEY'),
    defaultFrom: {
      email: configService.get<string>(
        'MAIL_DEFAULT_FROM_EMAIL',
        'noreply@example.com'
      ),
      name: configService.get<string>(
        'MAIL_DEFAULT_FROM_NAME',
        'Nest Template'
      ),
    },
  };
}
