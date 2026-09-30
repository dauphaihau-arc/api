import { Injectable } from '@nestjs/common';
import { CouponPricingService } from '~/domains/coupon/app/services/coupon-pricing.service';
import type { AppliedCoupon } from '~/domains/coupon/app/types/coupon.types';
import type { CartActor } from '../../cart.types';
import { CartNotFoundError } from '../../errors/cart-app.error';
import { GetCartUseCase } from '../get-cart/get-cart.use-case';

/**
 * Adds a Coupon code to a shop cart's selection. The code replaces any retained
 * code in the same slot, and the whole resulting selection is validated before
 * it is returned; a rejected selection throws, so the caller keeps its previous
 * state untouched.
 */
@Injectable()
export class ApplyCouponUseCase {
  constructor(
    private readonly getCartUseCase: GetCartUseCase,
    private readonly couponPricingService: CouponPricingService,
  ) {}

  async execute(input: {
    actor: CartActor;
    cartId?: string;
    shopId: string;
    code: string;
    promoCodes: string[];
  }): Promise<{ promoCodes: string[]; appliedCoupons: AppliedCoupon[] }> {
    const cart = await this.getCartUseCase.execute(input.actor, input.cartId);

    if (!cart) {
      throw new CartNotFoundError();
    }

    const appliedCoupons = await this.couponPricingService.addPromoCode({
      userId: input.actor.type === 'user' ? input.actor.userId : undefined,
      cart,
      shopId: input.shopId,
      code: input.code,
      retainedPromoCodes: input.promoCodes,
    });

    return {
      promoCodes: appliedCoupons.map((coupon) => coupon.code),
      appliedCoupons,
    };
  }
}
