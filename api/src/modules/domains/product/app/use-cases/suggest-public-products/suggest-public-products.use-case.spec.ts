import type { ProductRepository } from '../../ports/product.repository';
import { SuggestPublicProductsUseCase } from './suggest-public-products.use-case';

describe('SuggestPublicProductsUseCase', () => {
  function buildRepository(): jest.Mocked<ProductRepository> {
    return {
      createDraft: jest.fn(),
      findById: jest.fn(),
      findPublicByShopSlugAndProductSlug: jest.fn(),
      listByShop: jest.fn(),
      listPublic: jest.fn(),
      suggestPublic: jest.fn().mockResolvedValue([
        {
          id: 'product-1',
          title: 'Handmade Mug',
          slug: 'handmade-mug',
          shop: {
            id: 'shop-1',
            publicId: 'shop-pub-1',
            shopName: 'Arc Store',
            slug: 'arc-store',
          },
        },
      ]),
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

  it('trims the query before delegating to the repository', async () => {
    const repository = buildRepository();
    const useCase = new SuggestPublicProductsUseCase(repository);

    await expect(useCase.execute('  mug  ', 4)).resolves.toEqual([
      {
        id: 'product-1',
        title: 'Handmade Mug',
        slug: 'handmade-mug',
        shop: {
          id: 'shop-1',
          publicId: 'shop-pub-1',
          shopName: 'Arc Store',
          slug: 'arc-store',
        },
      },
    ]);
    expect(repository.suggestPublic).toHaveBeenCalledWith({
      search: 'mug',
      limit: 4,
    });
  });

  it('returns an empty list for short queries', async () => {
    const repository = buildRepository();
    const useCase = new SuggestPublicProductsUseCase(repository);

    await expect(useCase.execute(' a ')).resolves.toEqual([]);
    expect(repository.suggestPublic).not.toHaveBeenCalled();
  });
});
