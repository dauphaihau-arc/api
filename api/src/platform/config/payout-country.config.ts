import type { ConfigService } from '@nestjs/config';

/**
 * Which connected accounts Stripe may send a payout to is Stripe's rule, not
 * ours: a platform in the US, the UK, the EEA, Canada or Switzerland can pay out
 * only to accounts in those same regions, whatever the platform's own country
 * is. That makes the recipient set a constant, and leaves our configuration a
 * matter of choosing the platform's region and optionally narrowing further.
 *
 * Docs: https://docs.stripe.com/connect/cross-border-payouts-to-recipients
 */
const EU_COUNTRY_CODES: readonly string[] = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
];

/** The EEA is the EU plus Iceland, Liechtenstein and Norway. */
const EEA_COUNTRY_CODES: readonly string[] = [...EU_COUNTRY_CODES, 'IS', 'LI', 'NO'];

/**
 * The countries a Stripe Connect payout can reach, and the countries whose
 * platforms may send them. Anything outside this set fails the transfer with
 * “Funds can't be sent to accounts located in …”, so onboarding refuses it
 * before the provider is ever called.
 */
export const STRIPE_CROSS_BORDER_PAYOUT_COUNTRIES: readonly string[] = [
  ...EEA_COUNTRY_CODES,
  'GB',
  'CA',
  'CH',
  'US',
];

/** The platform country when the deployment does not name one. */
export const DEFAULT_PAYOUT_PLATFORM_COUNTRY = 'US';

/**
 * The countries onboarding accepts when `PAYOUT_CONNECT_COUNTRIES` is unset:
 * exactly Stripe's supported recipient set. Ops narrows this list, never
 * expands it, because the region rule above is the provider's.
 */
export const DEFAULT_PAYOUT_CONNECT_COUNTRIES: readonly string[] =
  STRIPE_CROSS_BORDER_PAYOUT_COUNTRIES;

const ISO_ALPHA_2_PATTERN = /^[A-Z]{2}$/;

export interface PayoutConnectCountriesConfig {
  /** The platform's ISO 3166-1 alpha-2 country, which decides the regions Stripe may pay into. */
  platformCountry: string;

  /** The allowed ISO 3166-1 alpha-2 codes, deduped, in configured order. */
  countries: readonly string[];
}

export const PAYOUT_CONNECT_COUNTRIES_CONFIG = Symbol(
  'PAYOUT_CONNECT_COUNTRIES_CONFIG',
);

export function buildPayoutConnectCountriesConfig(
  configService: Pick<ConfigService, 'get'>,
): PayoutConnectCountriesConfig {
  const platformCountry = resolvePlatformCountry(
    configService.get<string>('PAYOUT_PLATFORM_COUNTRY'),
  );
  const supported = supportedPayoutRecipientCountries(platformCountry);
  const raw = configService.get<string>('PAYOUT_CONNECT_COUNTRIES');

  return {
    platformCountry,
    // The env list can only narrow the region set: a code outside it is
    // intersected away rather than added, so no deployment can onboard a seller
    // Stripe would refuse to pay.
    countries: raw === undefined
      ? supported
      : resolveConnectCountries(raw, supported),
  };
}

/**
 * The recipients a platform in `platformCountry` may pay. Every supported
 * platform region shares the same recipient set; a platform outside the
 * regions cannot use Connect payouts at all, so its configuration is refused.
 */
export function supportedPayoutRecipientCountries(
  platformCountry: string,
): readonly string[] {
  if (!STRIPE_CROSS_BORDER_PAYOUT_COUNTRIES.includes(platformCountry)) {
    throw new Error(
      `PAYOUT_PLATFORM_COUNTRY must be one of ${STRIPE_CROSS_BORDER_PAYOUT_COUNTRIES.join(', ')}: Stripe only supports Connect payouts from those regions, received "${platformCountry}"`,
    );
  }

  return STRIPE_CROSS_BORDER_PAYOUT_COUNTRIES;
}

/** Whether onboarding may start in `country`, compared as a normalized ISO code. */
export function isSupportedConnectCountry(
  config: PayoutConnectCountriesConfig,
  country: string,
): boolean {
  return config.countries.includes(country.trim().toUpperCase());
}

function resolvePlatformCountry(value: string | undefined): string {
  if (value === undefined) {
    return DEFAULT_PAYOUT_PLATFORM_COUNTRY;
  }

  return parseCountry(value, 'PAYOUT_PLATFORM_COUNTRY');
}

function resolveConnectCountries(
  value: string,
  supported: readonly string[],
): readonly string[] {
  if (value.trim() === '') {
    throw new Error(
      'PAYOUT_CONNECT_COUNTRIES must be a comma-separated list of ISO 3166-1 alpha-2 codes, received an empty list',
    );
  }

  const countries = value.split(',').map(part => parseCountry(part, 'PAYOUT_CONNECT_COUNTRIES'));
  const narrowed = [...new Set(countries)].filter(country => supported.includes(country));

  if (narrowed.length === 0) {
    throw new Error(
      `PAYOUT_CONNECT_COUNTRIES narrows to none of Stripe's supported payout countries (${supported.join(', ')}), received "${value}"`,
    );
  }

  return narrowed;
}

function parseCountry(value: string, name: string): string {
  const country = value.trim().toUpperCase();

  if (!ISO_ALPHA_2_PATTERN.test(country)) {
    throw new Error(
      `${name} must contain ISO 3166-1 alpha-2 country codes, received "${value}"`,
    );
  }

  return country;
}
