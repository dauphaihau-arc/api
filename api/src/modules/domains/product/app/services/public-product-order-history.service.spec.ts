import type { PublicProductOrderHistoryRepository } from '../ports/public-product-order-history.repository';
import type { StorefrontProductQueryRepository } from '../ports/storefront-product-query.repository';
import type { GetPublicProductBySlugsUseCase } from '../use-cases/get-public-product-by-slugs/get-public-product-by-slugs.use-case';
import { PublicProductOrderHistoryService } from './public-product-order-history.service';

describe('PublicProductOrderHistoryService', () => {
  function buildDependencies() {
    const repository: Pick<jest.Mocked<PublicProductOrderHistoryRepository>, 'listBestSellingProductIds' | 'listFrequentlyBoughtTogetherProductIds'> = {
      listBestSellingProductIds: jest.fn(),
      listFrequentlyBoughtTogetherProductIds: jest.fn(),
    };
    const getPublicProductBySlugsUseCase: Pick<jest.Mocked<GetPublicProductBySlugsUseCase>, 'execute'> = {
      execute: jest.fn(),
    };
    const storefrontProductQueryRepository: Pick<jest.Mocked<StorefrontProductQueryRepository>, 'findPublicByIds' | 'findPublicCardsByIds'> = {
      findPublicByIds: jest.fn(),
      findPublicCardsByIds: jest.fn(),
    };

    return {
      service: new PublicProductOrderHistoryService(
        repository as never,
        getPublicProductBySlugsUseCase as never,
        storefrontProductQueryRepository as never,
      ),
      repository,
      getPublicProductBySlugsUseCase,
      storefrontProductQueryRepository,
    };
  }

  it('lists best-selling in-stock products through the repository', async () => {
    const { service, repository, storefrontProductQueryRepository } = buildDependencies();
    repository.listBestSellingProductIds.mockResolvedValue(['product-1', 'product-2', 'product-3']);
    storefrontProductQueryRepository.findPublicCardsByIds.mockResolvedValue([
      {
        id: 'product-1',
        shop: { id: 'shop-1', shopName: 'Arc Store', slug: 'arc-store' },
        title: 'First',
        slug: 'first',
        availability: { inStock: true, lowStock: false, stockTotal: 4 },
        variantCount: 1,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'product-2',
        shop: { id: 'shop-1', shopName: 'Arc Store', slug: 'arc-store' },
        title: 'Second',
        slug: 'second',
        availability: { inStock: false, lowStock: false, stockTotal: 0 },
        variantCount: 1,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
      {
        id: 'product-3',
        shop: { id: 'shop-1', shopName: 'Arc Store', slug: 'arc-store' },
        title: 'Third',
        slug: 'third',
        availability: { inStock: true, lowStock: true, stockTotal: 1 },
        variantCount: 1,
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
      },
    ] as never);

    await expect(service.listBestSellingProducts({ limit: 2 })).resolves.toEqual([
      expect.objectContaining({ id: 'product-1' }),
      expect.objectContaining({ id: 'product-3' }),
    ]);
    expect(repository.listBestSellingProductIds).toHaveBeenCalledWith({ limit: 2 });
    expect(storefrontProductQueryRepository.findPublicCardsByIds).toHaveBeenCalledWith([
      'product-1',
      'product-2',
      'product-3',
    ]);
  });

  it('resolves the anchor product before listing frequently bought together products', async () => {
    const {
      service,
      repository,
      getPublicProductBySlugsUseCase,
      storefrontProductQueryRepository,
    } = buildDependencies();
    getPublicProductBySlugsUseCase.execute.mockResolvedValue({ id: 'anchor-1' } as never);
    repository.listFrequentlyBoughtTogetherProductIds.mockResolvedValue(['product-2']);
    storefrontProductQueryRepository.findPublicByIds.mockResolvedValue([
      {
        id: 'product-2',
        shop: { id: 'shop-1', shopName: 'Arc Store', slug: 'arc-store' },
        title: 'Second',
        slug: 'second',
        availability: { inStock: true, lowStock: false, stockTotal: 2 },
        variantCount: 1,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ] as never);

    await expect(service.listFrequentlyBoughtTogether({
      shopSlug: 'arc-store',
      productSlug: 'anchor',
      limit: 3,
      windowDays: 90,
    })).resolves.toEqual([expect.objectContaining({ id: 'product-2' })]);
    expect(repository.listFrequentlyBoughtTogetherProductIds).toHaveBeenCalledWith({
      productId: 'anchor-1',
      limit: 3,
      windowDays: 90,
    });
  });
});
