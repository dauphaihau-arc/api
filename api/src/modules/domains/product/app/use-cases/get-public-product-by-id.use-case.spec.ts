import type { ProductRepository } from '../ports/product.repository';
import type { PublicProductDetail } from '../product.types';
import { GetPublicProductByIdUseCase } from './get-public-product-by-id.use-case';

describe('GetPublicProductByIdUseCase', () => {
  const product: PublicProductDetail = {
    id: 'product-1',
    shop: {
      id: 'shop-1',
      shopName: 'owner-shop',
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
      findPublicById: jest.fn().mockResolvedValue(product),
      listByShop: jest.fn(),
      listPublic: jest.fn(),
      replaceImages: jest.fn(),
      replaceAttributeValues: jest.fn(),
      replaceVariants: jest.fn(),
      replaceInventory: jest.fn(),
      replaceShipping: jest.fn(),
      updateDetails: jest.fn(),
      publish: jest.fn(),
      findByShopIdAndSlug: jest.fn(),
    };
  }

  it('returns the public product when found', async () => {
    const repository = buildRepository();
    const useCase = new GetPublicProductByIdUseCase(repository);

    const result = await useCase.execute(product.id);

    expect(repository.findPublicById).toHaveBeenCalledWith(product.id);
    expect(result).toEqual(product);
  });
});
