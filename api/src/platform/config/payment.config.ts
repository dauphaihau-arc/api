import type { ConfigService } from '@nestjs/config';
import ms from 'ms';
import { parseDurationToMilliseconds } from '~/shared/libs/duration';
import { parseCorsAllowedOrigins } from './cors.config';

// Stripe rejects `expires_at` outside 30 minutes to 24 hours after session
// creation, so the configured session lifetime is validated against that window
// instead of being clamped silently.
const STRIPE_MIN_CHECKOUT_SESSION_TTL_MS = 30 * 60 * 1000;
const STRIPE_MAX_CHECKOUT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface PaymentConfig {
  stripeSecretKey?: string;
  stripeWebhookSecretKey?: string;
  appBaseUrl?: string;
  /**
   * Lifetime of a Checkout Session. The Card Order stock hold is derived from
   * this value, so a payable session can never outlive its own hold.
   */
  checkoutSessionTtlMs: number;
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
    checkoutSessionTtlMs: resolveCheckoutSessionTtlMs(
      parseDurationToMilliseconds(
        configService.get<string>('CHECKOUT_SESSION_TTL'),
        ms('60m'),
      ),
    ),
  };
}

function resolveCheckoutSessionTtlMs(value: number): number {
  if (
    value < STRIPE_MIN_CHECKOUT_SESSION_TTL_MS
    || value > STRIPE_MAX_CHECKOUT_SESSION_TTL_MS
  ) {
    throw new Error(
      `CHECKOUT_SESSION_TTL must be between 30m and 24h (Stripe expires_at constraint), received ${value}ms`,
    );
  }

  return value;
}
