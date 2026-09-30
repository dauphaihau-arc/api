import { Injectable } from '@nestjs/common';
import { CouponPricingService } from '~/domains/coupon/app/services/coupon-pricing.service';
import type { DiscoverableCoupon } from '~/domains/coupon/app/types/coupon.types';
import type { CartActor } from '../../cart.types';
import { GetCartUseCase } from '../get-cart/get-cart.use-case';

/**
 * Lists the Coupons a buyer can discover for one shop of their current cart:
 * public Coupons, flagged as eligible or ineligible for the cart. An unknown or
 * unowned cart yields an empty list rather than leaking another actor's cart
 * state.
 */
@Injectable()
export class ListDiscoverableCouponsUseCase {
  constructor(
    private readonly getCartUseCase: GetCartUseCase,
    private readonly couponPricingService: CouponPricingService,
  ) {}

  async execute(input: {
    actor: CartActor;
    cartId?: string;
    shopId: string;
  }): Promise<DiscoverableCoupon[]> {
    const cart = await this.getCartUseCase.execute(input.actor, input.cartId);

    if (!cart) {
      return [];
    }

    const checkoutCurrency = cart.items.find((item) => item.isSelectOrder)
      ?.inventory.currency ?? 'USD';

    return this.couponPricingService.listDiscoverableCoupons({
      userId: input.actor.type === 'user' ? input.actor.userId : undefined,
      cart,
      shopId: input.shopId,
      checkoutCurrency,
    });
  }
}
