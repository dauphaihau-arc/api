import { Injectable } from '@nestjs/common';
import { PromotionPricingService } from '~/domains/promotion/app/services/promotion-pricing.service';
import type { AppliedPromoCode } from '~/domains/promotion/app/types/promotion.types';
import type { CartActor } from '../../cart.types';
import { CartNotFoundError } from '../../errors/cart-app.error';
import { GetCartUseCase } from '../get-cart/get-cart.use-case';

/**
 * Adds a Promo Code to a shop cart's selection. The code replaces any retained
 * code in the same slot, and the whole resulting selection is validated before
 * it is returned; a rejected selection throws, so the caller keeps its previous
 * state untouched.
 */
@Injectable()
export class ApplyPromoCodeUseCase {
  constructor(
    private readonly getCartUseCase: GetCartUseCase,
    private readonly promotionPricingService: PromotionPricingService,
  ) {}

  async execute(input: {
    actor: CartActor;
    cartId?: string;
    shopId: string;
    code: string;
    promoCodes: string[];
  }): Promise<{ promoCodes: string[]; appliedPromoCodes: AppliedPromoCode[] }> {
    const cart = await this.getCartUseCase.execute(input.actor, input.cartId);

    if (!cart) {
      throw new CartNotFoundError();
    }

    const appliedPromoCodes = await this.promotionPricingService.addPromoCode({
      userId: input.actor.type === 'user' ? input.actor.userId : undefined,
      cart,
      shopId: input.shopId,
      code: input.code,
      retainedPromoCodes: input.promoCodes,
    });

    return {
      promoCodes: appliedPromoCodes.map((promoCode) => promoCode.code),
      appliedPromoCodes,
    };
  }
}
