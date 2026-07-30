import type { EntityManager } from '@mikro-orm/postgresql';
import type { CreateShopInput, ShopSummary } from '../shop.types';

export abstract class ShopRepository {
  abstract create(
    input: CreateShopInput,
    entityManager?: EntityManager
  ): Promise<ShopSummary>;
  abstract findById(id: string): Promise<ShopSummary | null>;
  abstract findByOwnerUserId(ownerUserId: string): Promise<ShopSummary | null>;
  abstract findByShopName(shopName: string): Promise<ShopSummary | null>;
  abstract findBySlug(slug: string): Promise<ShopSummary | null>;
  abstract findOwnedById(
    id: string,
    ownerUserId: string
  ): Promise<ShopSummary | null>;
}
