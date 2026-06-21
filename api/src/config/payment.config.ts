import type { ConfigService } from '@nestjs/config';
import { parseCorsAllowedOrigins } from './cors.config';

export interface PaymentConfig {
  stripeSecretKey?: string;
  stripeWebhookSecretKey?: string;
  appBaseUrl?: string;
}

export const PAYMENT_CONFIG = Symbol('PAYMENT_CONFIG');

export function buildPaymentConfig(
  configService: Pick<ConfigService, 'get'>,
): PaymentConfig {
  const appBaseUrl = configService.get<string>('APP_BASE_URL') ??
    parseCorsAllowedOrigins({
      CORS_ALLOWED_ORIGINS: configService.get<string>('CORS_ALLOWED_ORIGINS'),
    })[0];

  return {
    stripeSecretKey: configService.get<string>('STRIPE_SECRET_KEY'),
    stripeWebhookSecretKey: configService.get<string>(
      'STRIPE_WEBHOOK_SECRET_KEY',
    ),
    appBaseUrl,
  };
}
