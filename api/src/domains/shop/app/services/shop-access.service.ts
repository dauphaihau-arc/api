import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ShopRepository } from '../ports/shop.repository';
import type { ShopSummary } from '../shop.types';

@Injectable()
export class ShopAccessService {
  constructor(private readonly shopRepository: ShopRepository) {}

  async resolveShopPublicId(publicId: string): Promise<string> {
    const shop = await this.shopRepository.findByPublicId(publicId);
    if (!shop) {
      throw new NotFoundException('Shop was not found');
    }
    return shop.id;
  }

  async resolveShopPublicIds(publicIds: readonly string[]): Promise<readonly (string | null)[]> {
    if (publicIds.length === 0) return [];
    const shops = await this.shopRepository.findByPublicIds(publicIds);
    return shops.map((shop) => shop?.id ?? null);
  }

  async resolveManageableShopByPublicId(
    actor: AuthenticatedUser,
    publicId: string,
  ): Promise<ShopSummary> {
    const shop = await this.shopRepository.findByPublicId(publicId);
    if (!shop) throw new NotFoundException('Shop was not found');
    if (actor.roles.includes('admin') || shop.ownerUserId === actor.userId) return shop;
    throw new ForbiddenException('You do not own this shop');
  }

  async assertCanManageShop(
    actor: AuthenticatedUser,
    shopId: string,
  ): Promise<void> {
    await this.resolveManageableShop(actor, shopId);
  }

  async resolveManageableShop(
    actor: AuthenticatedUser,
    shopId: string,
  ): Promise<ShopSummary> {
    if (actor.roles.includes('admin')) {
      const shop = await this.shopRepository.findById(shopId);

      if (!shop) {
        throw new NotFoundException('Shop was not found');
      }

      return shop;
    }

    const shop = await this.shopRepository.findOwnedById(shopId, actor.userId);

    if (shop) {
      return shop;
    }

    const existingShop = await this.shopRepository.findById(shopId);

    if (!existingShop) {
      throw new NotFoundException('Shop was not found');
    }

    throw new ForbiddenException('You do not own this shop');
  }
}
