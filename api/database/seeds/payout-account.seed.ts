import type { EntityManager } from '@mikro-orm/postgresql';
import type { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import {
  MANUAL_BANK_PROVIDER,
  assertValidPayoutAccount,
  maskReference,
  type PayoutAccountStatus,
  type PayoutAccountType,
} from '~/domains/finance/domain/rules/payout-account';
import { PayoutAccountEntity } from '~/domains/finance/infra/persistence/entities/payout-account.entity';
import { FieldEncryptionService } from '~/platform/crypto/field-encryption.service';
import {
  PAYOUT_ACCOUNTS_LOCAL_TSV_PATH,
  PAYOUT_ACCOUNTS_TSV_PATH,
} from './product-seed-paths';
import { readOptionalTsvRows } from './shared/read-tsv-rows';

type PayoutAccountCsvRow = {
  shop_slug: string;
  type: string;
  holder_name: string;
  bank_name: string;
  country: string;
  account_reference: string;
  status: string;
};

type PayoutAccountSeed = {
  shopSlug: string;
  type: PayoutAccountType;
  holderName: string;
  bankName: string;
  country: string;
  accountReference: string;
  status: PayoutAccountStatus;
};

const PAYOUT_ACCOUNT_STATUSES: readonly PayoutAccountStatus[] = [
  'pending',
  'active',
  'disabled',
];

/**
 * The seed TSV names the shops that get a Payout Account, so every shop it does
 * not name is left exactly as it is. A local row replaces the shared row with
 * the same shop slug, matching the other seeders.
 *
 * Each row goes through the same domain rules a seller's write does, so the seed
 * cannot create an account the API would refuse.
 */
function loadPayoutAccountSeeds(): PayoutAccountSeed[] {
  const rowsBySlug = new Map<string, PayoutAccountCsvRow>();

  for (const row of [
    ...readOptionalTsvRows<PayoutAccountCsvRow>(PAYOUT_ACCOUNTS_TSV_PATH),
    ...readOptionalTsvRows<PayoutAccountCsvRow>(PAYOUT_ACCOUNTS_LOCAL_TSV_PATH),
  ]) {
    rowsBySlug.set(row.shop_slug, row);
  }

  return [...rowsBySlug.values()].map((row) => {
    const input = {
      type: row.type,
      holderName: row.holder_name,
      bankName: row.bank_name,
      country: row.country,
      accountReference: row.account_reference,
    };

    assertValidPayoutAccount(input);

    if (!PAYOUT_ACCOUNT_STATUSES.includes(row.status as PayoutAccountStatus)) {
      throw new Error(
        `[seed][payout-accounts] ${row.shop_slug} has unknown status "${row.status}"`,
      );
    }

    return {
      shopSlug: row.shop_slug,
      type: input.type,
      holderName: input.holderName,
      bankName: input.bankName,
      country: input.country,
      accountReference: input.accountReference,
      status: row.status as PayoutAccountStatus,
    };
  });
}

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }

  return `${(ms / 1_000).toFixed(1)}s`;
}

/**
 * Seeds Payout Accounts for the shops named in `payout-accounts.tsv`. Re-running
 * updates the open account in place, so a seed run never leaves a shop with two
 * active accounts; the currency always comes from the shop, never from the seed.
 */
export async function seedPayoutAccounts(
  em: EntityManager,
  shopsBySlug: Map<string, ShopEntity>,
): Promise<void> {
  const seeds = loadPayoutAccountSeeds();

  if (seeds.length === 0) {
    console.log('[seed][payout-accounts] No Payout Account seed rows');
    return;
  }

  const encryption = new FieldEncryptionService({
    fieldEncryptionKey: process.env.FIELD_ENCRYPTION_KEY,
  });

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

  console.log(`[seed][payout-accounts] Upserting ${seeds.length} Payout Accounts`);
  const startedAt = Date.now();
  const now = new Date();

  for (const [index, seed] of seeds.entries()) {
    const shop = shopsBySlug.get(seed.shopSlug);

    if (!shop) {
      throw new Error(`[seed][payout-accounts] Unknown shop slug "${seed.shopSlug}"`);
    }

    const providerRefEncrypted = encryption.encrypt(seed.accountReference);
    const { last4 } = maskReference(seed.accountReference);
    const account = existingByShopId.get(shop.id);

    if (account) {
      account.type = seed.type;
      account.provider = MANUAL_BANK_PROVIDER;
      account.providerRefEncrypted = providerRefEncrypted;
      account.holderName = seed.holderName;
      account.bankName = seed.bankName;
      account.country = seed.country;
      account.currency = shop.currency;
      account.last4 = last4;
      account.status = seed.status;

      if (seed.status === 'active' && !account.verifiedAt) {
        account.verifiedAt = now;
      }
    }
    else {
      em.persist(em.create(PayoutAccountEntity, {
        shop,
        type: seed.type,
        provider: MANUAL_BANK_PROVIDER,
        providerRefEncrypted,
        holderName: seed.holderName,
        bankName: seed.bankName,
        country: seed.country,
        currency: shop.currency,
        last4,
        status: seed.status,
        verifiedAt: seed.status === 'active' ? now : undefined,
      }));
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
