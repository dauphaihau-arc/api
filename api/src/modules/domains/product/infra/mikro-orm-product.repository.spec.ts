import type { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
import type { RequestContextService } from '~/modules/shared/request-context/request-context.service';
import type { ResolvedStorefrontPriceService } from '../app/services/resolved-storefront-price.service';
import { ProductImageVariant } from '../domain/enums/product-image-variant.enum';
import { ProductState } from '../domain/enums/product-state.enum';
import type { ProductInventoryEntity } from './persistence/entities/product-inventory.entity';
import { ProductImageVariantEntity } from './persistence/entities/product-image-variant.entity';
import { ProductImageEntity } from './persistence/entities/product-image.entity';
import { MikroOrmProductRepository } from './mikro-orm-product.repository';

describe('MikroOrmProductRepository image projection', () => {
  function buildRepository() {
    const storageService: jest.Mocked<StorageService> = {
      putObject: jest.fn(),
      getObject: jest.fn(),
      deleteObject: jest.fn(),
      exists: jest.fn(),
      getPublicUrl: jest.fn((key: string) => `https://cdn.example.com/${key}`),
      ping: jest.fn(),
    };

    const resolvedStorefrontPriceService = {
      resolveForCurrentRequest: jest.fn(),
      resolve: jest.fn(),
    } as unknown as jest.Mocked<ResolvedStorefrontPriceService>;
    const requestContextService = {
      get: jest.fn().mockReturnValue({}),
    } as unknown as jest.Mocked<RequestContextService>;

    const repository = new MikroOrmProductRepository(
      {} as never,
      storageService,
      resolvedStorefrontPriceService,
      requestContextService
    );

    return {
      repository,
      storageService,
      resolvedStorefrontPriceService,
      requestContextService,
    };
  }

  it('prefers the card_1x1 variant for public list images', () => {
    const { repository } = buildRepository();
    const cardVariant = new ProductImageVariantEntity();
    cardVariant.variant = ProductImageVariant.CARD_1X1;
    cardVariant.storageKey = 'products/card_1x1.webp';

    const image = {
      storageKey: 'products/original.jpg',
      rank: 1,
      variants: {
        getItems: () => [cardVariant],
      },
    } as unknown as ProductImageEntity;

    const projected = (repository as any).toPublicListImage(image);

    expect(projected).toEqual({
      storageKey: 'products/card_1x1.webp',
      variant: 'card_1x1',
      variants: {
        card_1x1: {
          storageKey: 'products/card_1x1.webp',
        },
      },
    });
  });

  it('falls back to the original image when no card variant exists', () => {
    const { repository } = buildRepository();
    const image = {
      storageKey: 'products/original.jpg',
      rank: 1,
      variants: {
        getItems: () => [],
      },
    } as unknown as ProductImageEntity;

    const projected = (repository as any).toPublicListImage(image);

    expect(projected).toEqual({
      storageKey: 'products/original.jpg',
      variant: 'original',
    });
  });

  it('does not invent a summary price when inventory has no active base price', () => {
    const { repository } = buildRepository();
    const inventory = {
      prices: {
        getItems: () => [],
      },
    } as unknown as ProductInventoryEntity;

    const projected = (repository as any).getSummaryPricing(inventory);

    expect(projected).toEqual({
      amountMinor: undefined,
      currency: undefined,
    });
  });

  it('returns the active base price currency and amount in summaries', () => {
    const { repository } = buildRepository();
    const inventory = {
      prices: {
        getItems: () => [
          {
            amountMinor: 30,
            currency: 'JPY',
            activeTo: undefined,
          },
        ],
      },
    } as unknown as ProductInventoryEntity;

    const projected = (repository as any).getSummaryPricing(inventory);

    expect(projected).toEqual({
      amountMinor: 30,
      currency: 'JPY',
    });
  });

  it('hides removed products from the default shop list', () => {
    const { repository } = buildRepository();

    expect((repository as any).shouldIncludeInShopList(ProductState.REMOVED)).toBe(false);
    expect((repository as any).shouldIncludeInShopList(ProductState.ACTIVE)).toBe(true);
    expect((repository as any).shouldIncludeInShopList(ProductState.REMOVED, ProductState.REMOVED)).toBe(true);
  });

  it('hides public list products that do not have any images', () => {
    const { repository } = buildRepository();
    const product = {
      state: ProductState.ACTIVE,
      images: {
        getItems: () => [],
      },
    } as never;

    expect((repository as any).shouldIncludeInPublicList(product)).toBe(false);
  });

  it('keeps active public list products that have at least one image', () => {
    const { repository } = buildRepository();
    const product = {
      state: ProductState.ACTIVE,
      images: {
        getItems: () => [{}],
      },
    } as never;

    expect((repository as any).shouldIncludeInPublicList(product)).toBe(true);
  });

  it('escapes wildcard characters in public search patterns', () => {
    const { repository } = buildRepository();

    expect((repository as any).buildSearchLikePattern('  50%_Off\\Now  ')).toBe('%50\\%\\_off\\\\now%');
    expect((repository as any).buildSearchPrefixPattern('  50%_Off\\Now  ')).toBe('50\\%\\_off\\\\now%');
    expect((repository as any).escapeSearchPattern('50%_Off\\Now')).toBe('50\\%\\_Off\\\\Now');
  });

  it('uses relevance ordering for default text search results', () => {
    const { repository } = buildRepository();

    expect((repository as any).buildPublicListOrdering({
      page: 1,
      limit: 12,
      search: '  mug  ',
    })).toEqual({
      orderByClause: `
        order by
          case
            when lower(p.title) = ? then 0
            when lower(p.title) like ? escape '\\' then 1
            when lower(p.title) like ? escape '\\' then 2
            when lower(p.description) like ? escape '\\' then 3
            else 4
          end asc,
          p.created_at desc
      `,
      params: ['mug', 'mug%', '%mug%', '%mug%'],
    });
  });

  it('keeps newest ordering when search is absent or explicitly requested', () => {
    const { repository } = buildRepository();

    expect((repository as any).buildPublicListOrdering({
      page: 1,
      limit: 12,
    })).toEqual({
      orderByClause: 'order by p.created_at desc',
      params: [],
    });

    expect((repository as any).buildPublicListOrdering({
      page: 1,
      limit: 12,
      search: 'mug',
      order: 'newest',
    })).toEqual({
      orderByClause: 'order by p.created_at desc',
      params: [],
    });
  });

  it('uses cached default-market sort prices for SQL price ordering when available', () => {
    const { repository, requestContextService } = buildRepository();
    requestContextService.get.mockReturnValue({
      marketCode: 'US',
      currency: 'USD',
    });

    expect((repository as any).buildPublicListOrdering({
      page: 1,
      limit: 12,
      order: 'price_asc',
    })).toEqual({
      orderByClause: `
        order by
          coalesce(
            (p.public_sort_prices ->> ?)::integer,
            9007199254740991
          ) asc,
          p.created_at desc
      `,
      params: ['US:USD'],
    });
  });

  it('does not use cached price sorting for non-default request currencies', () => {
    const { repository, requestContextService } = buildRepository();
    requestContextService.get.mockReturnValue({
      marketCode: 'US',
      currency: 'EUR',
    });

    expect((repository as any).canUseDenormalizedPriceSort('price_desc')).toBe(false);
  });

  it('refreshes cached public sort prices from the primary inventory', async () => {
    const { repository, resolvedStorefrontPriceService } = buildRepository();
    resolvedStorefrontPriceService.resolve
      .mockResolvedValueOnce({
        amountMinor: 1200,
        currency: 'USD',
        sourceCurrency: 'USD',
        sourceUnitAmountMinor: 1200,
        sourceType: 'base_native',
        sourcePriceId: 'price-usd',
      })
      .mockResolvedValueOnce({
        amountMinor: 31000,
        currency: 'VND',
        sourceCurrency: 'VND',
        sourceUnitAmountMinor: 31000,
        sourceType: 'base_native',
        sourcePriceId: 'price-vnd',
      });

    const product = {
      publicSortPrices: undefined as Record<string, number> | undefined,
      inventoryRecords: {
        getItems: () => [{
          productVariant: undefined,
          prices: {
            getItems: () => [],
          },
        }],
      },
    };

    await (repository as any).refreshPublicSortPrices(product);

    expect(product.publicSortPrices).toEqual({
      'US:USD': 1200,
      'VN:VND': 31000,
    });
  });
});
