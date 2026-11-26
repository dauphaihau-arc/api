import { Injectable } from '@nestjs/common';
import { StorefrontMarketContextService } from '~/domains/product/app/services/storefront-market-context.service';
import { ShippingQuoteService } from '~/domains/shipping/app/services/shipping-quote.service';
import type { CartItemShipping, CartSnapshot } from '../cart.types';

/**
 * Attaches buyer-facing Shipping Preview state to cart lines for the request
 * Market's Preview Destination. The cart is never mutated: the returned copy
 * carries the shipping state while selection and stored quantities stay as-is.
 */
@Injectable()
export class CartShippingPreviewService {
  constructor(
    private readonly marketContextService: StorefrontMarketContextService,
    private readonly shippingQuoteService: ShippingQuoteService,
  ) {}

  async attach(cart: CartSnapshot | null): Promise<CartSnapshot | null> {
    if (!cart || cart.items.length === 0) {
      return cart;
    }

    const marketContext = await this.marketContextService.resolveCurrentRequest();

    if (!marketContext) {
      return cart;
    }

    const productIds = [...new Set(cart.items.map(item => item.inventory.productId))];
    const resolutions = await this.shippingQuoteService.resolveForProducts({
      productIds,
      destination: { countryCode: marketContext.previewCountryCode },
    });
    const shippingByProductId = new Map<string, CartItemShipping>(
      resolutions.map(resolution => [resolution.productId, {
        available: resolution.available,
        isDigital: resolution.isDigital,
        ...(resolution.reason ? { reason: resolution.reason } : {}),
      }]),
    );

    return {
      ...cart,
      items: cart.items.map((item) => {
        const shipping = shippingByProductId.get(item.inventory.productId);

        return shipping ? { ...item, shipping } : item;
      }),
    };
  }
}
