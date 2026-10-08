import { Injectable, NotFoundException } from '@nestjs/common';
import { ShopAccessService } from '~/domains/shop/app/services/shop-access.service';

@Injectable()
export class CartPublicShopResolver {
  constructor(private readonly shopAccessService: ShopAccessService) {}

  async resolveShopId(publicId: string): Promise<string> {
    const [shopId] = await this.resolveShopIds([publicId]);
    return shopId;
  }

  async resolveShopIds(publicIds: readonly string[]): Promise<string[]> {
    const resolved = await this.shopAccessService.resolveShopPublicIds(publicIds);
    return resolved.map((shopId) => {
      if (!shopId) throw new NotFoundException('Shop was not found');
      return shopId;
    });
  }

  async resolveShopAdjustments<T extends { shopId: string }>(adjustments: readonly T[]): Promise<Array<Omit<T, 'shopId'> & { shopId: string }>> {
    const shopIds = await this.resolveShopIds(adjustments.map(({ shopId }) => shopId));
    return adjustments.map((adjustment, index) => ({ ...adjustment, shopId: shopIds[index] }));
  }
}
