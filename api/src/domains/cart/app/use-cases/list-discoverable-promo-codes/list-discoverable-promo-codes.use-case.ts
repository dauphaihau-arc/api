import { Injectable } from '@nestjs/common';
import { PromotionPricingService } from '~/domains/promotion/app/services/promotion-pricing.service';
import type { DiscoverablePromoCode } from '~/domains/promotion/app/types/promotion.types';
import type { CartActor } from '../../cart.types';
import { GetCartUseCase } from '../get-cart/get-cart.use-case';

/**
 * Lists the Promo Codes a buyer can discover for one shop of their current
 * cart: public codes, flagged as eligible or ineligible for the cart. An
 * unknown or unowned cart yields an empty list rather than leaking another
 * actor's cart state.
 */
@Injectable()
export class ListDiscoverablePromoCodesUseCase {
  constructor(
    private readonly getCartUseCase: GetCartUseCase,
    private readonly promotionPricingService: PromotionPricingService,
  ) {}

  async execute(input: {
    actor: CartActor;
    cartId?: string;
    shopId: string;
  }): Promise<DiscoverablePromoCode[]> {
    const cart = await this.getCartUseCase.execute(input.actor, input.cartId);

    if (!cart) {
      return [];
    }

    const checkoutCurrency = cart.items.find((item) => item.isSelectOrder)
      ?.inventory.currency ?? 'USD';

    return this.promotionPricingService.listDiscoverablePromoCodes({
      userId: input.actor.type === 'user' ? input.actor.userId : undefined,
      cart,
      shopId: input.shopId,
      checkoutCurrency,
    });
  }
}
