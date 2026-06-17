import type { PublicProductViewHistoryRepository } from '../ports/public-product-view-history.repository';
import type { StorefrontProductQueryRepository } from '../ports/storefront-product-query.repository';
import type { GetPublicProductBySlugsUseCase } from '../use-cases/get-public-product-by-slugs/get-public-product-by-slugs.use-case';
import { PublicProductViewHistoryService } from './public-product-view-history.service';

describe('PublicProductViewHistoryService', () => {
  function buildDependencies() {
    const repository: Pick<jest.Mocked<PublicProductViewHistoryRepository>, 'recordView' | 'listRecentViewProductIds' | 'listTrendingProductIds' | 'listAlsoViewedProductIds'> = {
      recordView: jest.fn(),
      listRecentViewProductIds: jest.fn(),
      listTrendingProductIds: jest.fn(),
      listAlsoViewedProductIds: jest.fn(),
    };
    const getPublicProductBySlugsUseCase: Pick<jest.Mocked<GetPublicProductBySlugsUseCase>, 'execute'> = {
      execute: jest.fn(),
    };
    const storefrontProductQueryRepository: Pick<jest.Mocked<StorefrontProductQueryRepository>, 'findPublicByIds'> = {
      findPublicByIds: jest.fn(),
    };

    return {
      service: new PublicProductViewHistoryService(
        repository as never,
        getPublicProductBySlugsUseCase as never,
        storefrontProductQueryRepository as never
      ),
      repository,
      getPublicProductBySlugsUseCase,
      storefrontProductQueryRepository,
    };
  }

  it('records a view through the repository after resolving the product', async () => {
    const { service, repository, getPublicProductBySlugsUseCase } = buildDependencies();
    getPublicProductBySlugsUseCase.execute.mockResolvedValue({ id: 'product-1' } as never);
    repository.recordView.mockResolvedValue();

    await service.recordView({
      shopSlug: 'arc-store',
      productSlug: 'handmade-bag',
      guestSessionId: 'guest-1',
    });

    expect(repository.recordView).toHaveBeenCalledWith({
      productId: 'product-1',
      userId: undefined,
      guestSessionId: 'guest-1',
    });
  });

  it('returns recent views by hydrating product ids from the repository', async () => {
    const { service, repository, storefrontProductQueryRepository } = buildDependencies();
    repository.listRecentViewProductIds.mockResolvedValue(['product-1']);
    storefrontProductQueryRepository.findPublicByIds.mockResolvedValue([
      {
        id: 'product-1',
        shop: { id: 'shop-1', shopName: 'Arc Store', slug: 'arc-store' },
        title: 'Viewed',
        slug: 'viewed',
        availability: { inStock: true, lowStock: false, stockTotal: 4 },
        variantCount: 1,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ] as never);

    await expect(service.listRecentViews({
      userId: 'user-1',
      limit: 5,
    })).resolves.toEqual([expect.objectContaining({ id: 'product-1' })]);
    expect(repository.listRecentViewProductIds).toHaveBeenCalledWith({
      userId: 'user-1',
      limit: 5,
    });
  });

  it('filters trending products to in-stock items', async () => {
    const { service, repository, storefrontProductQueryRepository } = buildDependencies();
    repository.listTrendingProductIds.mockResolvedValue(['product-1', 'product-2']);
    storefrontProductQueryRepository.findPublicByIds.mockResolvedValue([
      {
        id: 'product-1',
        shop: { id: 'shop-1', shopName: 'Arc Store', slug: 'arc-store' },
        title: 'In Stock',
        slug: 'in-stock',
        availability: { inStock: true, lowStock: false, stockTotal: 3 },
        variantCount: 1,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'product-2',
        shop: { id: 'shop-1', shopName: 'Arc Store', slug: 'arc-store' },
        title: 'Out Of Stock',
        slug: 'out-of-stock',
        availability: { inStock: false, lowStock: false, stockTotal: 0 },
        variantCount: 1,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ] as never);

    await expect(service.listTrendingProducts({ limit: 2 })).resolves.toEqual([
      expect.objectContaining({ id: 'product-1' }),
    ]);
  });
});
