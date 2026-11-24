import type { ShippingQuoteService } from '~/domains/shipping/app/services/shipping-quote.service';
import type { PublicProductDetail } from '../../product.types';
import type { StorefrontMarketContextService } from '../../services/storefront-market-context.service';
import type { GetPublicProductBySlugsUseCase } from '../get-public-product-by-slugs/get-public-product-by-slugs.use-case';
import { GetPublicProductDetailUseCase } from './get-public-product-detail.use-case';

const product: PublicProductDetail = {
  id: 'product-1',
  publicId: 'public-product-1',
  shop: {
    id: 'shop-1',
    publicId: 'public-shop-1',
    shopName: 'owner-shop',
    slug: 'owner-shop',
  },
  title: 'Handmade Mug',
  slug: 'handmade-mug',
  description: 'Wheel-thrown ceramic mug',
  whoMade: 'i_did' as PublicProductDetail['whoMade'],
  isDigital: false,
  stockNoticeThreshold: 10,
  reviewSummary: { average: 0, count: 0 },
  images: [],
  variants: [],
  inventory: [],
};

const shippingPreview = {
  available: true,
  isDigital: false,
  currency: 'USD',
  oneItemFeeMinor: 599,
  estimate: { minDays: 4, maxDays: 8 },
};

function buildUseCase() {
  const getPublicProductBySlugsUseCase = {
    execute: jest.fn().mockResolvedValue(product),
  } satisfies Pick<GetPublicProductBySlugsUseCase, 'execute'>;
  const marketContextService = {
    resolveCurrentRequest: jest.fn().mockResolvedValue({
      marketCode: 'US',
      previewCountryCode: 'US',
      currency: 'USD',
      locale: 'en-US',
      source: 'request_headers',
    }),
  } satisfies Pick<StorefrontMarketContextService, 'resolveCurrentRequest'>;
  const shippingQuoteService = {
    resolvePreview: jest.fn().mockResolvedValue(shippingPreview),
  } satisfies Pick<ShippingQuoteService, 'resolvePreview'>;
  const useCase = new GetPublicProductDetailUseCase(
    getPublicProductBySlugsUseCase as never,
    marketContextService as never,
    shippingQuoteService as never,
  );

  return {
    useCase,
    getPublicProductBySlugsUseCase,
    marketContextService,
    shippingQuoteService,
  };
}

describe('GetPublicProductDetailUseCase', () => {
  it('adds the live Shipping Preview for the buyer Preview Destination', async () => {
    const {
      useCase,
      shippingQuoteService,
    } = buildUseCase();

    await expect(useCase.execute(
      product.shop.slug,
      product.slug,
    )).resolves.toEqual({
      ...product,
      shippingPreview,
    });

    expect(shippingQuoteService.resolvePreview).toHaveBeenCalledWith({
      productId: product.id,
      destination: { countryCode: 'US' },
      displayCurrency: 'USD',
      anchorAt: expect.any(Date),
    });
  });

  it('returns null when the product does not exist', async () => {
    const { useCase, getPublicProductBySlugsUseCase, shippingQuoteService } = buildUseCase();
    getPublicProductBySlugsUseCase.execute.mockResolvedValue(null);

    await expect(useCase.execute('missing-shop', 'missing-product')).resolves.toBeNull();
    expect(shippingQuoteService.resolvePreview).not.toHaveBeenCalled();
  });
});
