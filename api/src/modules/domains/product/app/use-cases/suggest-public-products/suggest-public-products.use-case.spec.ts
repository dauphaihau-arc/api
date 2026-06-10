import type { StorefrontProductQueryRepository } from '../../ports/storefront-product-query.repository';
import { SuggestPublicProductsUseCase } from './suggest-public-products.use-case';

describe('SuggestPublicProductsUseCase', () => {
  function buildRepository(): Pick<jest.Mocked<StorefrontProductQueryRepository>, 'suggestPublic'> {
    return {
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
    };
  }

  it('trims the query before delegating to the repository', async () => {
    const repository = buildRepository();
    const useCase = new SuggestPublicProductsUseCase(repository as never);

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
    const useCase = new SuggestPublicProductsUseCase(repository as never);

    await expect(useCase.execute(' a ')).resolves.toEqual([]);
    expect(repository.suggestPublic).not.toHaveBeenCalled();
  });
});
