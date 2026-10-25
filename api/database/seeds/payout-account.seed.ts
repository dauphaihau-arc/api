import type { EntityManager } from '@mikro-orm/postgresql';
import type { ConfigService } from '@nestjs/config';
import type { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import {
  MANUAL_BANK_PROVIDER,
  STRIPE_CONNECT_PROVIDER,
  assertValidPayoutAccountCountry,
  type PayoutAccountStatus,
} from '~/domains/finance/domain/rules/payout-account';
import { PayoutAccountEntity } from '~/domains/finance/infra/persistence/entities/payout-account.entity';
import { buildPayoutConnectCountriesConfig } from '~/platform/config/payout-country.config';
import {
  PAYOUT_ACCOUNTS_LOCAL_TSV_PATH,
  PAYOUT_ACCOUNTS_TSV_PATH,
} from './product-seed-paths';
import { readOptionalTsvRows } from './shared/read-tsv-rows';

type PayoutAccountCsvRow = {
  shop_slug: string;
  country: string;
  status: string;
};

type PayoutAccountSeed = {
  shopSlug: string;
  /** An ISO country, or {@link RANDOM_SEED_COUNTRY} to pick one when seeded. */
  country: string;
  status: PayoutAccountStatus;
};

/**
 * The `country` sentinel for a demo row that should land anywhere in Stripe's
 * supported payout region. Resolved when the seed runs, so a re-seed spreads the
 * demo shops across countries; an explicit country is always honoured.
 */
export const RANDOM_SEED_COUNTRY = 'random';

const PAYOUT_ACCOUNT_STATUSES: readonly PayoutAccountStatus[] = [
  'onboarding',
  'action_required',
  'active',
  'restricted',
  'disabled',
];

/**
 * Local seed files written before payout accounts became Connect accounts still
 * say `pending` (and occasionally `verified`). They are developer-owned and
 * gitignored, so the loader maps the old words instead of failing the seed.
 */
const LEGACY_PAYOUT_ACCOUNT_STATUSES: Readonly<Record<string, PayoutAccountStatus>> = {
  pending: 'onboarding',
  verified: 'active',
};

/**
 * Which adapter the seed should shape its accounts for. The seed cannot fake a
 * Stripe onboarding, so `stripe_connect` seeds unonboarded rows that the portal
 * sends through the hosted flow; `manual_bank` keeps the local payable rows.
 */
function resolveSeedProvider(): typeof MANUAL_BANK_PROVIDER | typeof STRIPE_CONNECT_PROVIDER {
  const value = (process.env.PAYOUT_PROVIDER ?? MANUAL_BANK_PROVIDER).trim();

  if (value === STRIPE_CONNECT_PROVIDER) {
    return STRIPE_CONNECT_PROVIDER;
  }

  if (value !== '' && value !== MANUAL_BANK_PROVIDER) {
    throw new Error(
      `[seed][payout-accounts] Unknown PAYOUT_PROVIDER "${value}"`,
    );
  }

  return MANUAL_BANK_PROVIDER;
}

/**
 * The seed TSV names the shops that get a Payout Account, so every shop it does
 * not name is left exactly as it is. A local row replaces the shared row with
 * the same shop slug, matching the other seeders.
 *
 * Seed accounts follow `PAYOUT_PROVIDER`. `manual_bank` creates the local
 * payable rows used for offline demos; `stripe_connect` creates unonboarded
 * rows (status `onboarding`, no `acct_…`) so the seller portal sends the seller
 * through Stripe's hosted KYC, because a seeded row cannot complete Stripe's
 * onboarding. The country still goes through the same domain rule a seller's
 * request does, so the seed cannot create an account the API would refuse.
 *
 * Stripe only pays accounts in its cross-border region, so a row in any other
 * country is skipped — with a log line naming it — rather than seeded into a
 * demo account no payout could ever reach. The shipped TSVs already comply;
 * this guards future edits and local files.
 */
export function loadPayoutAccountSeeds(
  paths: { shared: string; local: string } = {
    shared: PAYOUT_ACCOUNTS_TSV_PATH,
    local: PAYOUT_ACCOUNTS_LOCAL_TSV_PATH,
  },
): PayoutAccountSeed[] {
  const rowsBySlug = new Map<string, PayoutAccountCsvRow>();

  for (const row of [
    ...readOptionalTsvRows<PayoutAccountCsvRow>(paths.shared),
    ...readOptionalTsvRows<PayoutAccountCsvRow>(paths.local),
  ]) {
    rowsBySlug.set(row.shop_slug, row);
  }

  const seeds = [...rowsBySlug.values()].map((row) => {
    const country = row.country.trim().toLowerCase() === RANDOM_SEED_COUNTRY
      ? RANDOM_SEED_COUNTRY
      : row.country.toUpperCase();

    if (country !== RANDOM_SEED_COUNTRY) {
      assertValidPayoutAccountCountry(country);
    }

    const status = LEGACY_PAYOUT_ACCOUNT_STATUSES[row.status] ?? row.status;

    if (!PAYOUT_ACCOUNT_STATUSES.includes(status as PayoutAccountStatus)) {
      throw new Error(
        `[seed][payout-accounts] ${row.shop_slug} has unknown status "${row.status}"`,
      );
    }

    return {
      shopSlug: row.shop_slug,
      country,
      status: status as PayoutAccountStatus,
    };
  });

  const supportedCountries = resolveSupportedPayoutCountries();
  const isSeedable = (seed: PayoutAccountSeed): boolean =>
    seed.country === RANDOM_SEED_COUNTRY
    || supportedCountries.includes(seed.country);
  const seedable = seeds.filter(isSeedable);
  const unsupported = seeds.filter(seed => !isSeedable(seed));

  if (unsupported.length > 0) {
    console.log(
      `[seed][payout-accounts] Skipping ${unsupported.length} shop(s) whose country Stripe cannot pay out to (${supportedCountries.join(', ')}): ${unsupported.map(seed => `${seed.shopSlug} (${seed.country})`).join(', ')}`,
    );
  }

  return seedable;
}

/**
 * The country a seed row is written with: an explicit country as-is, or a
 * uniformly random member of the supported set for a `random` row.
 */
export function resolveSeedCountry(
  country: string,
  supportedCountries: readonly string[],
  random: () => number = Math.random,
): string {
  if (country !== RANDOM_SEED_COUNTRY) {
    return country;
  }

  if (supportedCountries.length === 0) {
    throw new Error('[seed][payout-accounts] No supported payout country to pick from');
  }

  const index = Math.min(
    Math.floor(random() * supportedCountries.length),
    supportedCountries.length - 1,
  );

  return supportedCountries[index]!;
}

/**
 * The same allowlist the API validates at startup, read straight from the
 * environment because the seed runs outside Nest's container.
 */
function resolveSupportedPayoutCountries(): readonly string[] {
  const configService: Pick<ConfigService, 'get'> = {
    get: <T>(key: string) => process.env[key] as T | undefined,
  };

  return buildPayoutConnectCountriesConfig(configService).countries;
}

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }

  return `${(ms / 1_000).toFixed(1)}s`;
}

/**
 * Demo data seeds only the first N rows of the payout-account TSV. The rest are
 * intentionally left without a Payout Account so the seller portal shows the
 * "not started" state (“Get paid with Stripe”) alongside shops that are mid
 * onboarding. This is demo-data shaping, not a product rule.
 */
const PAYOUT_ACCOUNT_SEED_LIMIT = 10;

/**
 * Seeds Payout Accounts for the shops named in `payout-accounts.tsv`. Re-running
 * updates the open account in place, so a seed run never leaves a shop with two
 * active accounts; the currency always comes from the shop, never from the seed.
 */
export async function seedPayoutAccounts(
  em: EntityManager,
  shopsBySlug: Map<string, ShopEntity>,
): Promise<void> {
  const supportedCountries = resolveSupportedPayoutCountries();
  const allSeeds = loadPayoutAccountSeeds();
  const seeds = allSeeds
    .slice(0, PAYOUT_ACCOUNT_SEED_LIMIT)
    .map(seed => ({
      ...seed,
      country: resolveSeedCountry(seed.country, supportedCountries),
    }));
  const unseeded = allSeeds.slice(PAYOUT_ACCOUNT_SEED_LIMIT);

  if (seeds.length === 0) {
    console.log('[seed][payout-accounts] No Payout Account seed rows');
    return;
  }

  if (unseeded.length > 0) {
    console.log(
      `[seed][payout-accounts] Leaving ${unseeded.length} shop(s) without a Payout Account: ${unseeded.map((seed) => seed.shopSlug).join(', ')}`,
    );
  }

  const shops = seeds.map((seed) => {
    const shop = shopsBySlug.get(seed.shopSlug);

    if (!shop) {
      throw new Error(`[seed][payout-accounts] Unknown shop slug "${seed.shopSlug}"`);
    }

    return shop;
  });

  const existingAccounts = await em.find(PayoutAccountEntity, {
    shop: { $in: shops },
    deactivatedAt: null,
  });
  const existingByShopId = new Map(
    existingAccounts.map((account) => [account.shop.id, account]),
  );

  const provider = resolveSeedProvider();
  const usesStripeConnect = provider === STRIPE_CONNECT_PROVIDER;

  console.log(
    `[seed][payout-accounts] Upserting ${seeds.length} Payout Accounts for ${provider}`,
  );
  const startedAt = Date.now();

  for (const [index, seed] of seeds.entries()) {
    const shop = shopsBySlug.get(seed.shopSlug);

    if (!shop) {
      throw new Error(`[seed][payout-accounts] Unknown shop slug "${seed.shopSlug}"`);
    }

    const account = existingByShopId.get(shop.id);

    // A seeded Connect account cannot complete Stripe's KYC. Seed it as an
    // unonboarded row so the seller portal asks for the hosted flow, and never
    // clobber an account a developer already onboarded.
    if (usesStripeConnect && account?.providerAccountId) {
      continue;
    }

    console.log(
      `[seed][payout-accounts] ${seed.shopSlug}: ${seed.country} (${seed.status})`,
    );

    if (usesStripeConnect) {
      const status = seed.status === 'active' ? 'onboarding' : seed.status;

      if (account) {
        account.provider = STRIPE_CONNECT_PROVIDER;
        account.providerAccountId = null;
        account.country = seed.country;
        account.currency = shop.currency;
        account.defaultCurrency = shop.currency;
        account.status = status;
        account.payoutsEnabled = false;
        account.chargesEnabled = false;
        account.transfersCapability = null;
        account.requirements = null;
        account.bankName = null;
        account.last4 = null;
      }
      else {
        em.persist(em.create(PayoutAccountEntity, {
          shop,
          provider: STRIPE_CONNECT_PROVIDER,
          providerAccountId: null,
          country: seed.country,
          currency: shop.currency,
          defaultCurrency: shop.currency,
          status,
          payoutsEnabled: false,
          chargesEnabled: false,
          transfersCapability: null,
          requirements: null,
        }));
      }
    }
    else {
      const enabled = seed.status === 'active';

      if (account) {
        account.provider = MANUAL_BANK_PROVIDER;
        account.providerAccountId = null;
        account.country = seed.country;
        account.currency = shop.currency;
        account.status = seed.status;
        account.payoutsEnabled = enabled;
        account.chargesEnabled = enabled;
        account.transfersCapability = enabled ? 'active' : null;
        account.requirements = null;
        account.defaultCurrency = shop.currency;
      }
      else {
        em.persist(em.create(PayoutAccountEntity, {
          shop,
          provider: MANUAL_BANK_PROVIDER,
          providerAccountId: null,
          country: seed.country,
          currency: shop.currency,
          status: seed.status,
          payoutsEnabled: enabled,
          chargesEnabled: enabled,
          transfersCapability: enabled ? 'active' : null,
          requirements: null,
          defaultCurrency: shop.currency,
        }));
      }
    }

    if ((index + 1) % 20 === 0 || index === seeds.length - 1) {
      console.log(
        `[seed][payout-accounts] Processed ${index + 1}/${seeds.length} in ${formatDuration(Date.now() - startedAt)}`,
      );
    }
  }

  await em.flush();

  console.log(
    `[seed][payout-accounts] Done in ${formatDuration(Date.now() - startedAt)}`,
  );
}
