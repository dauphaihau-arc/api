import type { SellerProductQueryRepository } from '../../ports/seller-product-query.repository';
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

  function buildRepository(): Pick<jest.Mocked<SellerProductQueryRepository>, 'findById'> {
    return {
      findById: jest.fn().mockResolvedValue(product),
    };
  }

  it('returns the product when found', async () => {
    const repository = buildRepository();
    const useCase = new GetProductByIdUseCase(repository as never);

    const result = await useCase.execute(product.id);

    expect(repository.findById).toHaveBeenCalledWith(product.id);
    expect(result).toEqual(product);
  });

  it('returns null when missing', async () => {
    const repository = buildRepository();
    repository.findById.mockResolvedValue(null);
    const useCase = new GetProductByIdUseCase(repository as never);

    const result = await useCase.execute('missing-product');

    expect(result).toBeNull();
  });
});
