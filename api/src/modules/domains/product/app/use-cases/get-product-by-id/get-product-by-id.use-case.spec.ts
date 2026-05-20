import type { ProductRepository } from '../../ports/product.repository';
import type { ProductDraftSummary } from '../../product.types';
import { GetProductByIdUseCase } from './get-product-by-id.use-case';

describe('GetProductByIdUseCase', () => {
  const product: ProductDraftSummary = {
    id: 'product-1',
    shopId: 'shop-1',
    categoryId: 'category-1',
    title: 'Handmade Mug',
    slug: 'handmade-mug',
    description: 'Wheel-thrown ceramic mug',
    state: 'draft' as ProductDraftSummary['state'],
    whoMade: 'i_did' as ProductDraftSummary['whoMade'],
    isDigital: false,
    nonTaxable: false,
    variantType: 'none' as ProductDraftSummary['variantType'],
    images: [],
    attributes: [],
    variants: [],
    inventory: [],
  };

  function buildRepository(): jest.Mocked<ProductRepository> {
    return {
      createDraft: jest.fn(),
      findById: jest.fn().mockResolvedValue(product),
      findPublicByShopSlugAndProductSlug: jest.fn(),
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

  it('returns the product when found', async () => {
    const repository = buildRepository();
    const useCase = new GetProductByIdUseCase(repository);

    const result = await useCase.execute(product.id);

    expect(repository.findById).toHaveBeenCalledWith(product.id);
    expect(result).toEqual(product);
  });

  it('returns null when missing', async () => {
    const repository = buildRepository();
    repository.findById.mockResolvedValue(null);
    const useCase = new GetProductByIdUseCase(repository);

    const result = await useCase.execute('missing-product');

    expect(result).toBeNull();
  });
});
