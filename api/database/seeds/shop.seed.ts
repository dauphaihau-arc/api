import { EntityManager } from '@mikro-orm/postgresql';
import { CurrentUserEntity } from '../../src/modules/domains/auth/infra/persistence/entities/current-user.entity';
import { ShopEntity } from '../../src/modules/domains/shop/infra/persistence/entities/shop.entity';

const shopSeeds = [
  { ownerEmail: 'maker.olive@example.com', shopName: 'Olive Atelier' },
  { ownerEmail: 'maker.mason@example.com', shopName: 'Reed Workshop' },
  { ownerEmail: 'maker.sage@example.com', shopName: 'Sage Studio' },
] as const;

export async function seedShops(
  em: EntityManager,
  usersByEmail: Map<string, CurrentUserEntity>
): Promise<Map<string, ShopEntity>> {
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
        status: 'active',
      });

    shop.ownerUser = owner;
    shop.status = 'active';
    em.persist(shop);
    shopsByName.set(shop.shopName, shop);
  }

  await em.flush();
  return shopsByName;
}
