import type { ProductRepository } from '../../ports/product.repository';
import type { PublicProductDetail } from '../../product.types';
import { GetPublicProductBySlugsUseCase } from './get-public-product-by-slugs.use-case';

describe('GetPublicProductBySlugsUseCase', () => {
  const product: PublicProductDetail = {
    id: 'product-1',
    shop: {
      id: 'shop-1',
      shopName: 'owner-shop',
      slug: 'owner-shop',
    },
    categoryId: 'category-1',
    title: 'Handmade Mug',
    slug: 'handmade-mug',
    description: 'Wheel-thrown ceramic mug',
    whoMade: 'i_did' as PublicProductDetail['whoMade'],
    isDigital: false,
    variantType: 'none' as PublicProductDetail['variantType'],
    images: [],
    variants: [],
    inventory: [],
  };

  function buildRepository(): jest.Mocked<ProductRepository> {
    return {
      createDraft: jest.fn(),
      findById: jest.fn(),
      findPublicByShopSlugAndProductSlug: jest.fn().mockResolvedValue(product),
      listByShop: jest.fn(),
      listPublic: jest.fn(),
      replaceImages: jest.fn(),
      replaceAttributeValues: jest.fn(),
      replaceVariants: jest.fn(),
      replaceInventory: jest.fn(),
      replaceShipping: jest.fn(),
      updateDetails: jest.fn(),
      updateState: jest.fn(),
      publish: jest.fn(),
      findByShopIdAndSlug: jest.fn(),
    };
  }

  it('returns the public product when found by slugs', async () => {
    const repository = buildRepository();
    const useCase = new GetPublicProductBySlugsUseCase(repository);

    const result = await useCase.execute(product.shop.slug, product.slug);

    expect(repository.findPublicByShopSlugAndProductSlug).toHaveBeenCalledWith(
      product.shop.slug,
      product.slug
    );
    expect(result).toEqual(product);
  });
});
