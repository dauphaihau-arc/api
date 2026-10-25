import type { ConfigService } from '@nestjs/config';

/** Which adapter owns payout destinations and money movement. */
export type PayoutProvider = 'manual_bank' | 'stripe_connect';

const PAYOUT_PROVIDERS: readonly PayoutProvider[] = [
  'manual_bank',
  'stripe_connect',
];

/**
 * `manual_bank` keeps local development and tests working without Stripe;
 * production is expected to set `stripe_connect`.
 */
const DEFAULT_PAYOUT_PROVIDER: PayoutProvider = 'manual_bank';

const DEFAULT_CONNECT_RETURN_URL = 'http://localhost:3000/finances';
const DEFAULT_CONNECT_REFRESH_URL = 'http://localhost:3000/finances';

export interface PayoutProviderConfig {
  provider: PayoutProvider;

  /** Where Stripe sends the seller when onboarding completes. */
  connectReturnUrl: string;

  /** Where Stripe sends the seller when a link expired and must be reissued. */
  connectRefreshUrl: string;
}

export const PAYOUT_PROVIDER_CONFIG = Symbol('PAYOUT_PROVIDER_CONFIG');

export function buildPayoutProviderConfig(
  configService: Pick<ConfigService, 'get'>,
): PayoutProviderConfig {
  return {
    provider: parsePayoutProvider(
      configService.get<string>('PAYOUT_PROVIDER', DEFAULT_PAYOUT_PROVIDER),
    ),
    connectReturnUrl: resolveUrl(
      configService.get<string>('STRIPE_CONNECT_RETURN_URL'),
      DEFAULT_CONNECT_RETURN_URL,
      'STRIPE_CONNECT_RETURN_URL',
    ),
    connectRefreshUrl: resolveUrl(
      configService.get<string>('STRIPE_CONNECT_REFRESH_URL'),
      DEFAULT_CONNECT_REFRESH_URL,
      'STRIPE_CONNECT_REFRESH_URL',
    ),
  };
}

function parsePayoutProvider(value: string): PayoutProvider {
  const normalized = value.trim().toLowerCase();

  if (!PAYOUT_PROVIDERS.includes(normalized as PayoutProvider)) {
    throw new Error(
      `PAYOUT_PROVIDER must be one of ${PAYOUT_PROVIDERS.join(', ')}, received "${value}"`,
    );
  }

  return normalized as PayoutProvider;
}

function resolveUrl(
  value: string | undefined,
  fallback: string,
  envKey: string,
): string {
  const resolved = value?.trim() || fallback;

  try {
    // Stripe rejects a malformed return or refresh URL only after the seller
    // has already been handed a broken link, so refuse it at startup instead.
    new URL(resolved);
  }
  catch {
    throw new Error(`${envKey} must be an absolute URL, received "${resolved}"`);
  }

  return resolved;
}
