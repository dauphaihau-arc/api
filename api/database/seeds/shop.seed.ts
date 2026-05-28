import type { EntityManager } from '@mikro-orm/postgresql';
import type { MarketplaceCurrency } from '../../src/config/marketplace.config';
import type { CurrentUserEntity } from '../../src/modules/domains/auth/infra/persistence/entities/current-user.entity';
import { ShopEntity } from '../../src/modules/domains/shop/infra/persistence/entities/shop.entity';
import { SHOPS_LOCAL_TSV_PATH, SHOPS_TSV_PATH } from './product-seed-paths';
import { readOptionalTsvRows, readTsvRows } from './shared/read-tsv-rows';

type ShopSeed = {
  shopSlug: string;
  ownerEmail: string;
  shopName: string;
  description?: string;
  currency: MarketplaceCurrency;
};

type ShopCsvRow = {
  shop_slug: string;
  owner_email: string;
  shop_name: string;
  description: string;
  currency?: string;
};

function loadShopSeeds(): ShopSeed[] {
  return [
    ...readTsvRows<ShopCsvRow>(SHOPS_TSV_PATH),
    ...readOptionalTsvRows<ShopCsvRow>(SHOPS_LOCAL_TSV_PATH),
  ].map((row, index) => {
    const shopKey = `${row.shop_slug}::${row.owner_email}::${row.shop_name}#${index + 2}`;

    if (!row.shop_slug.trim()) {
      throw new Error(`Missing shop_slug for shop seed ${shopKey}`);
    }

    if (!row.owner_email.trim()) {
      throw new Error(`Missing owner_email for shop seed ${shopKey}`);
    }

    if (!row.shop_name.trim()) {
      throw new Error(`Missing shop_name for shop seed ${shopKey}`);
    }

    return {
      shopSlug: row.shop_slug.trim(),
      ownerEmail: row.owner_email.trim(),
      shopName: row.shop_name.trim(),
      description: row.description.trim() || undefined,
      currency: (row.currency?.trim() || 'USD') as MarketplaceCurrency,
    };
  });
}

const shopSeeds: ShopSeed[] = loadShopSeeds();

export async function seedShops(
  em: EntityManager,
  usersByEmail: Map<string, CurrentUserEntity>
): Promise<{ shopsBySlug: Map<string, ShopEntity>; shopsByName: Map<string, ShopEntity> }> {
  const shopsBySlug = new Map<string, ShopEntity>();
  const shopsByName = new Map<string, ShopEntity>();

  for (const shopSeed of shopSeeds) {
    const owner = usersByEmail.get(shopSeed.ownerEmail);
    if (!owner) {
      throw new Error(`Missing shop owner seed user: ${shopSeed.ownerEmail}`);
    }

    const shop =
      (await em.findOne(ShopEntity, { slug: shopSeed.shopSlug })) ??
      em.create(ShopEntity, {
        ownerUser: owner,
        shopName: shopSeed.shopName,
        slug: shopSeed.shopSlug,
        description: shopSeed.description,
        status: 'active',
        currency: shopSeed.currency,
      });

    shop.ownerUser = owner;
    shop.slug = shopSeed.shopSlug;
    shop.description = shopSeed.description;
    shop.status = 'active';
    shop.currency = shopSeed.currency;
    em.persist(shop);
    shopsBySlug.set(shopSeed.shopSlug, shop);
    shopsByName.set(shop.shopName, shop);
  }

  await em.flush();
  return { shopsBySlug, shopsByName };
}
