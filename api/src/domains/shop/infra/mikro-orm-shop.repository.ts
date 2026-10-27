import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { isUuid } from '~/platform/ids/uuid';
import type { FilterQuery } from '@mikro-orm/core';
import { ShopRepository } from '../app/ports/shop.repository';
import { toShopSummary } from '../app/shop-summary';
import type {
  AdminShopListRow,
  CreateShopInput,
  ListAdminShopsQuery,
  ShopSummary,
} from '../app/shop.types';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { ShopEntity } from './persistence/entities/shop.entity';

@Injectable()
export class MikroOrmShopRepository implements ShopRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async create(
    input: CreateShopInput,
    entityManager?: EntityManager,
  ): Promise<ShopSummary> {
    const em = entityManager ?? this.entityManager.fork();
    const repository = em.getRepository(ShopEntity);
    const shop = repository.create({
      ownerUser: em.getReference(UserEntity, input.ownerUserId),
      shopName: input.shopName,
      slug: input.slug,
      status: 'active',
      currency: input.currency,
    });

    await em.persistAndFlush(shop);
    await em.populate(shop, ['ownerUser']);

    return toShopSummary(shop);
  }

  async findById(id: string): Promise<ShopSummary | null> {
    if (!isUuid(id)) {
      return null;
    }

    const repository = this.entityManager.fork().getRepository(ShopEntity);
    const shop = await repository.findOne({ id }, { populate: ['ownerUser'] });

    return shop ? toShopSummary(shop) : null;
  }

  async findByPublicId(publicId: string): Promise<ShopSummary | null> {
    const repository = this.entityManager.fork().getRepository(ShopEntity);
    const shop = await repository.findOne(
      { publicId },
      { populate: ['ownerUser'] },
    );

    return shop ? toShopSummary(shop) : null;
  }

  async findByPublicIds(publicIds: readonly string[]): Promise<readonly (ShopSummary | null)[]> {
    if (publicIds.length === 0) return [];
    const repository = this.entityManager.fork().getRepository(ShopEntity);
    const shops = await repository.find({ publicId: { $in: [...new Set(publicIds)] } }, { populate: ['ownerUser'] });
    const byPublicId = new Map(shops.map((shop) => [shop.publicId, toShopSummary(shop)]));
    return publicIds.map((publicId) => byPublicId.get(publicId) ?? null);
  }

  async findByOwnerUserId(ownerUserId: string): Promise<ShopSummary | null> {
    const repository = this.entityManager.fork().getRepository(ShopEntity);
    const shop = await repository.findOne(
      { ownerUser: ownerUserId },
      { populate: ['ownerUser'] },
    );

    return shop ? toShopSummary(shop) : null;
  }

  async findByShopName(shopName: string): Promise<ShopSummary | null> {
    const repository = this.entityManager.fork().getRepository(ShopEntity);
    const shop = await repository.findOne(
      { shopName },
      { populate: ['ownerUser'] },
    );

    return shop ? toShopSummary(shop) : null;
  }

  async findBySlug(slug: string): Promise<ShopSummary | null> {
    const repository = this.entityManager.fork().getRepository(ShopEntity);
    const shop = await repository.findOne(
      { slug },
      { populate: ['ownerUser'] },
    );

    return shop ? toShopSummary(shop) : null;
  }

  async findOwnedById(
    id: string,
    ownerUserId: string,
  ): Promise<ShopSummary | null> {
    if (!isUuid(id)) {
      return null;
    }

    const repository = this.entityManager.fork().getRepository(ShopEntity);
    const shop = await repository.findOne(
      {
        id,
        ownerUser: ownerUserId,
      },
      { populate: ['ownerUser'] },
    );

    return shop ? toShopSummary(shop) : null;
  }

  async findAllForAdmin(
    query: ListAdminShopsQuery,
  ): Promise<{ items: AdminShopListRow[]; totalResults: number }> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(ShopEntity);
    const where: FilterQuery<ShopEntity> = {};

    if (query.search) {
      const search = `%${query.search}%`;
      where.$or = [
        { shopName: { $ilike: search } },
        { slug: { $ilike: search } },
        { publicId: { $ilike: search } },
        { ownerUser: { email: { $ilike: search } } },
      ];
    }

    const [shops, totalResults] = await repository.findAndCount(where, {
      populate: ['ownerUser'],
      orderBy: { createdAt: 'desc' },
      offset: (query.page - 1) * query.limit,
      limit: query.limit,
    });

    const productCounts = await countProductsByShopId(
      entityManager,
      shops.map((shop) => shop.id),
    );

    return {
      items: shops.map((shop) => ({
        id: shop.publicId,
        shopName: shop.shopName,
        slug: shop.slug,
        status: shop.status,
        currency: shop.currency,
        productCount: productCounts.get(shop.id) ?? 0,
        ownerEmail: shop.ownerUser.email,
        ownerName: shop.ownerUser.displayName ?? null,
        createdAt: shop.createdAt,
      })),
      totalResults,
    };
  }
}

/**
 * One grouped count for the whole page. Shops without products are absent
 * from the result and default to 0 at the call site. Variants never count:
 * only product rows do.
 */
async function countProductsByShopId(
  entityManager: EntityManager,
  shopIds: readonly string[],
): Promise<Map<string, number>> {
  if (shopIds.length === 0) {
    return new Map();
  }

  const placeholders = shopIds.map(() => '?').join(', ');
  const { tableName } = entityManager.getMetadata(ProductEntity);

  const rows = await entityManager.getConnection().execute<
    { shop_id: string; product_count: string | number }[]
  >(
    `
      select shop_id, count(*) as product_count
      from ${tableName}
      where shop_id in (${placeholders})
      group by shop_id
    `,
    [...shopIds],
  );

  return new Map(
    rows.map((row) => [row.shop_id, Number(row.product_count) || 0]),
  );
}
