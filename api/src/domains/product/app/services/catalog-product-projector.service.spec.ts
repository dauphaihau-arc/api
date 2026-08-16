import { ProductState } from '../../domain/enums/product-state.enum';
import type { CatalogProductProjectorSourceRepository } from '../ports/catalog-product-projector-source.repository';
import type { CatalogProductDocumentRepository } from '../ports/catalog-product-document.repository';
import type { CatalogProductPriceDocumentRepository } from '../ports/catalog-product-price-document.repository';
import type { CatalogProductSlugRepository } from '../ports/catalog-product-slug.repository';
import type { CatalogSearchDocumentRepository } from '../ports/catalog-search-document.repository';
import type { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { CatalogProductProjectorService } from './catalog-product-projector.service';
import type { StorefrontIndexedPriceProjectionService } from './storefront-indexed-price-projection.service';

describe('CatalogProductProjectorService', () => {
  function buildService() {
    const sourceRepository: Pick<jest.Mocked<CatalogProductProjectorSourceRepository>, 'findById'> = {
      findById: jest.fn(),
    };
    const storageService: Pick<jest.Mocked<StorageService>, 'getPublicUrl'> = {
      getPublicUrl: jest.fn((key: string) => `https://cdn.example.test/${key}`),
    };
    const productDocumentRepository: Pick<jest.Mocked<CatalogProductDocumentRepository>, 'upsert' | 'deleteByProductId'> = {
      upsert: jest.fn(),
      deleteByProductId: jest.fn(),
    };
    const productPriceDocumentRepository: Pick<jest.Mocked<CatalogProductPriceDocumentRepository>, 'upsert' | 'deleteByProductId'> = {
      upsert: jest.fn(),
      deleteByProductId: jest.fn(),
    };
    const productSlugRepository: Pick<jest.Mocked<CatalogProductSlugRepository>, 'upsert' | 'deleteByProductId'> = {
      upsert: jest.fn(),
      deleteByProductId: jest.fn(),
    };
    const searchDocumentRepository: Pick<jest.Mocked<CatalogSearchDocumentRepository>, 'upsert' | 'deleteByProductId'> = {
      upsert: jest.fn(),
      deleteByProductId: jest.fn(),
    };
    const storefrontIndexedPriceProjectionService: Pick<jest.Mocked<StorefrontIndexedPriceProjectionService>, 'projectProduct'> = {
      projectProduct: jest.fn().mockResolvedValue({
        summaryByMarket: undefined,
        inventoryPricingById: new Map(),
      }),
    };

    return {
      service: new CatalogProductProjectorService(
        sourceRepository as never,
        storageService as never,
        {
          driver: 'mongodb',
          searchDriver: 'atlas',
        } as never,
        productDocumentRepository as never,
        productPriceDocumentRepository as never,
        productSlugRepository as never,
        searchDocumentRepository as never,
        storefrontIndexedPriceProjectionService as never,
      ),
      sourceRepository,
      productDocumentRepository,
      productPriceDocumentRepository,
      productSlugRepository,
      searchDocumentRepository,
      storefrontIndexedPriceProjectionService,
    };
  }

  it('removes projected documents when the product is missing or inactive', async () => {
    const {
      service, sourceRepository, productDocumentRepository, productPriceDocumentRepository, productSlugRepository, searchDocumentRepository, 
    } = buildService();
    sourceRepository.findById.mockResolvedValue({ state: ProductState.INACTIVE } as never);

    await service.projectProduct('product-1');

    expect(productDocumentRepository.deleteByProductId).toHaveBeenCalledWith('product-1');
    expect(productPriceDocumentRepository.deleteByProductId).toHaveBeenCalledWith('product-1');
    expect(productSlugRepository.deleteByProductId).toHaveBeenCalledWith('product-1');
    expect(searchDocumentRepository.deleteByProductId).toHaveBeenCalledWith('product-1');
  });

  it('projects an active product into all catalog stores', async () => {
    const {
      service, sourceRepository, productDocumentRepository, productPriceDocumentRepository, productSlugRepository, searchDocumentRepository, 
    } = buildService();
    sourceRepository.findById.mockResolvedValue({
      id: 'product-1',
      createdAt: new Date('2026-06-11T01:00:00.000Z'),
      updatedAt: new Date('2026-06-11T02:00:00.000Z'),
      publishedAt: new Date('2026-06-11T02:00:00.000Z'),
      slug: 'linen-weekend-dress',
      title: 'Linen Weekend Dress',
      description: 'Relaxed linen dress',
      state: ProductState.ACTIVE,
      isDigital: false,
      whoMade: 'i_did',
      variantType: 'single',
      variantGroupName: 'Size',
      variantSubGroupName: undefined,
      views: 18,
      shop: {
        id: 'shop-1',
        publicId: 'shop-pub-1',
        slug: 'olive-atelier',
        shopName: 'Olive Atelier',
      },
      category: {
        id: 'category-1',
      },
      images: {
        getItems: () => [{
          id: 'image-1',
          storageKey: 'products/olive-atelier/linen-weekend-dress/main.png',
          rank: 1,
          variantStatus: 'ready',
          variantError: undefined,
          variantsGeneratedAt: new Date('2026-06-11T02:10:00.000Z'),
          variants: {
            length: 0,
            getItems: () => [],
          },
        }],
      },
      variants: {
        getItems: () => [],
      },
      inventoryRecords: {
        getItems: () => [],
      },
      shippingProfiles: {
        getItems: () => [],
      },
      attributeValues: {
        getItems: () => [],
      },
    } as never);

    await service.projectProduct('product-1');

    expect(productDocumentRepository.upsert).toHaveBeenCalledTimes(1);
    expect(productPriceDocumentRepository.upsert).toHaveBeenCalledTimes(1);
    expect(productSlugRepository.upsert).toHaveBeenCalledTimes(1);
    expect(searchDocumentRepository.upsert).toHaveBeenCalledTimes(1);
  });
});
