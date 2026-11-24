import { Injectable } from '@nestjs/common';
import { ShippingQuoteService } from '~/domains/shipping/app/services/shipping-quote.service';
import type { PublicProductDetail } from '../../product.types';
import { StorefrontMarketContextService } from '../../services/storefront-market-context.service';
import { GetPublicProductBySlugsUseCase } from '../get-public-product-by-slugs/get-public-product-by-slugs.use-case';

/**
 * Public product-detail composition. Keeps the shipping preview off the shared
 * lookup used by view history and recommendation services, which only need the
 * Product identity.
 */
@Injectable()
export class GetPublicProductDetailUseCase {
  constructor(
    private readonly getPublicProductBySlugsUseCase: GetPublicProductBySlugsUseCase,
    private readonly marketContextService: StorefrontMarketContextService,
    private readonly shippingQuoteService: ShippingQuoteService,
  ) {}

  async execute(
    shopSlug: string,
    productSlug: string,
  ): Promise<PublicProductDetail | null> {
    const product = await this.getPublicProductBySlugsUseCase.execute(
      shopSlug,
      productSlug,
    );

    if (!product) {
      return null;
    }

    const marketContext = await this.marketContextService.resolveCurrentRequest();

    if (!marketContext) {
      return product;
    }

    const shippingPreview = await this.shippingQuoteService.resolvePreview({
      productId: product.id,
      destination: { countryCode: marketContext.previewCountryCode },
      displayCurrency: marketContext.currency,
      anchorAt: new Date(),
    });

    return {
      ...product,
      shippingPreview,
    };
  }
}
