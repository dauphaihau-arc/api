import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderPublicIdLookup } from '~/domains/order/app/services/order-public-id-lookup.service';
import { ShopAccessService } from '~/domains/shop/app/services/shop-access.service';

@Injectable()
export class CheckoutPublicIdResolver {
  constructor(
    private readonly orderPublicIdLookup: OrderPublicIdLookup,
    private readonly shopAccessService: ShopAccessService,
  ) {}

  async resolveShopId(publicId: string): Promise<string> {
    const [shopId] = await this.shopAccessService.resolveShopPublicIds([publicId]);
    if (!shopId) throw new NotFoundException('Shop was not found');
    return shopId;
  }

  async resolveCheckoutQuoteShopIds<T extends { shopAdjustments?: Array<{ shopId: string }> | undefined }>(body: T): Promise<T> {
    if (!body.shopAdjustments?.length) return body;
    const adjustments = body.shopAdjustments;
    const shopIds = await this.shopAccessService.resolveShopPublicIds(adjustments.map(({ shopId }) => shopId));
    return {
      ...body,
      shopAdjustments: adjustments.map((adjustment, index) => {
        const shopId = shopIds[index];
        if (!shopId) throw new NotFoundException('Shop was not found');
        return { ...adjustment, shopId };
      }),
    };
  }

  async resolveOrderId(publicId: string): Promise<string> {
    return this.orderPublicIdLookup.resolveOrderPublicId(publicId);
  }

  async resolveOrderIds(publicIds: string[]): Promise<string[]> {
    if (publicIds.length === 0) return [];
    const idsByPublicId = await this.orderPublicIdLookup.resolveOrderPublicIds(publicIds);
    return publicIds.map((publicId) => {
      const orderId = idsByPublicId.get(publicId);
      if (!orderId) throw new NotFoundException('Order was not found');
      return orderId;
    });
  }
}
