import { Injectable } from '@nestjs/common';
import { CouponPricingService } from '~/domains/coupon/app/services/coupon-pricing.service';
import type {
  PricedCartSummary,
  ShopAdjustmentInput,
} from '~/domains/order/app/order.types';
import type {
  CartActor,
  CartSnapshot,
} from '../cart.types';

export interface CartUpdatePricingInput {
  actor: CartActor;
  cart: CartSnapshot;
  additionInfoTempCart?: {
    promoCodes?: string[];
    note?: string;
  };
  additionInfoShopCarts?: ShopAdjustmentInput[];
}

@Injectable()
export class CartUpdatePricingService {
  constructor(private readonly couponPricingService: CouponPricingService) {}

  buildPricedCartSummary(
    input: CartUpdatePricingInput,
  ): Promise<PricedCartSummary> {
    return this.couponPricingService.buildPricedCartSummary({
      userId: input.actor.type === 'user' ? input.actor.userId : undefined,
      cart: input.cart,
      shopAdjustments: resolvePricingAdjustments(input),
      validatePromoCodes: true,
    });
  }
}

// ---------- Private helpers ----------

function resolvePricingAdjustments(
  input: CartUpdatePricingInput,
): ShopAdjustmentInput[] | undefined {
  if (input.additionInfoShopCarts) {
    return input.additionInfoShopCarts;
  }

  const tempCartInfo = input.additionInfoTempCart;
  if (!tempCartInfo) {
    return undefined;
  }

  const selectedShopIds = [
    ...new Set(
      input.cart.items
        .filter((item) => item.isSelectOrder)
        .map((item) => item.inventory.shopId),
    ),
  ];

  return selectedShopIds.map((shopId) => ({
    shopId,
    promoCodes: tempCartInfo.promoCodes ?? [],
    note: tempCartInfo.note,
  }));
}
