import type { EntityManager } from '@mikro-orm/postgresql';
import * as path from 'node:path';
import type { CurrentUserEntity } from '../../src/modules/domains/auth/infra/persistence/entities/current-user.entity';
import { ShopEntity } from '../../src/modules/domains/shop/infra/persistence/entities/shop.entity';
import { readTsvRows } from './shared/read-tsv-rows';

type ShopSeed = {
  shopSlug: string;
  ownerEmail: string;
  shopName: string;
  description?: string;
};

type ShopCsvRow = {
  shop_slug: string;
  owner_email: string;
  shop_name: string;
  description: string;
};

const SHOPS_TSV_PATH = path.resolve(__dirname, '../../../seed-data/shops.tsv');

function loadShopSeeds(): ShopSeed[] {
  return readTsvRows<ShopCsvRow>(SHOPS_TSV_PATH).map((row, index) => {
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
      (await em.findOne(ShopEntity, { shopName: shopSeed.shopName })) ??
      em.create(ShopEntity, {
        ownerUser: owner,
        shopName: shopSeed.shopName,
        description: shopSeed.description,
        status: 'active',
      });

    shop.ownerUser = owner;
    shop.description = shopSeed.description;
    shop.status = 'active';
    em.persist(shop);
    shopsBySlug.set(shopSeed.shopSlug, shop);
    shopsByName.set(shop.shopName, shop);
  }

  await em.flush();
  return { shopsBySlug, shopsByName };
}
