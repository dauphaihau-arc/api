import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ShopRepository } from '../ports/shop.repository';
import type { ShopSummary } from '../shop.types';

@Injectable()
export class ShopAccessService {
  constructor(private readonly shopRepository: ShopRepository) {}

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
