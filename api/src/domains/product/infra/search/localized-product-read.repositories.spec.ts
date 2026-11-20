import type { ProductTranslationQueryRepository } from '../../app/ports/product-translation-query.repository';
import type { ProductRecommendationQueryRepository } from '../../app/ports/product-recommendation-query.repository';
import type { StorefrontProductQueryRepository } from '../../app/ports/storefront-product-query.repository';
import type {
  PublicProductListItem,
  PublicProductListResult,
  PublicProductSuggestion,
} from '../../app/product.types';
import { PublicProductLocalizationService } from '../../app/services/public-product-localization.service';
import { LocalizedProductRecommendationQueryRepository } from './localized-product-recommendation-query.repository';
import { LocalizedStorefrontProductQueryRepository } from './localized-storefront-product-query.repository';

function buildListItem(id: string, title: string): PublicProductListItem {
  return {
    id,
    publicId: `public-${id}`,
    shop: {
      id: 'shop-1',
      publicId: 'public-shop-1',
      shopName: 'Arc Store',
      slug: 'arc-store',
    },
    title,
    slug: `${id}-slug`,
    availability: {
      inStock: true,
      lowStock: false,
      stockTotal: 4,
    },
    variantCount: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function buildSuggestion(id: string, title: string): PublicProductSuggestion {
  return {
    id,
    publicId: `public-${id}`,
    title,
    slug: `${id}-slug`,
    shop: {
      id: 'shop-1',
      publicId: 'public-shop-1',
      shopName: 'Arc Store',
      slug: 'arc-store',
    },
  };
}

type TranslationRepositoryMock = jest.Mocked<
  Pick<ProductTranslationQueryRepository, 'findProductTranslations'>
>;

function buildTranslationRepository(): TranslationRepositoryMock {
  const repository: TranslationRepositoryMock = {
    findProductTranslations: jest.fn().mockResolvedValue(new Map()),
  };

  return repository;
}

function buildLocalizationService(
  translationRepository: TranslationRepositoryMock,
  locale: string,
) {
  return new PublicProductLocalizationService(
    translationRepository as never,
    { get: () => ({ locale }) } as never,
  );
}

describe('LocalizedStorefrontProductQueryRepository', () => {
  function buildDelegate() {
    const items = [
      buildListItem('product-1', 'Linen Dress'),
      buildListItem('product-2', 'Silk Scarf'),
    ];
    const listResult: PublicProductListResult = {
      items,
      meta: {
        page: 1,
        limit: 12,
        total: 2,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };
    const detail = {
      ...items[0],
      description: 'Relaxed linen dress',
      whoMade: 'i_did',
      isDigital: false,
      stockNoticeThreshold: 10,
      reviewSummary: { average: 0, count: 0 },
      images: [],
      variants: [],
      inventory: [],
    };

    return {
      findPublicByShopSlugAndProductSlug: jest.fn().mockResolvedValue(detail),
      findPublicByIds: jest.fn().mockResolvedValue(items),
      findPublicCardsByIds: jest.fn().mockResolvedValue(items),
      listPublic: jest.fn().mockResolvedValue(listResult),
      listPublicFacets: jest.fn().mockResolvedValue([
        { facetKey: 'material', attributeName: 'Material', options: [] },
      ]),
      suggestPublic: jest.fn().mockResolvedValue([
        buildSuggestion('product-1', 'Linen Dress'),
        buildSuggestion('product-2', 'Silk Scarf'),
      ]),
    } satisfies StorefrontProductQueryRepository;
  }

  it('localizes list items with a single batched lookup and keeps shapes intact', async () => {
    const translationRepository = buildTranslationRepository();
    const delegate = buildDelegate();
    translationRepository.findProductTranslations.mockResolvedValue(
      new Map([
        ['product-1', { title: 'Váy lanh', description: 'Váy lanh nhẹ' }],
        ['product-2', { title: 'Khăn lụa' }],
      ]),
    );
    const repository = new LocalizedStorefrontProductQueryRepository(
      delegate,
      buildLocalizationService(translationRepository, 'vi-VN'),
    );

    const result = await repository.listPublic({ page: 1, limit: 12 });

    expect(result.items.map((item) => item.title)).toEqual(['Váy lanh', 'Khăn lụa']);
    expect(result.items.map((item) => item.slug)).toEqual([
      'product-1-slug',
      'product-2-slug',
    ]);
    expect(result.meta).toEqual({
      page: 1,
      limit: 12,
      total: 2,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });
    expect(translationRepository.findProductTranslations).toHaveBeenCalledTimes(1);
    expect(translationRepository.findProductTranslations).toHaveBeenCalledWith(
      ['product-1', 'product-2'],
      'vi',
    );
  });

  it('localizes product detail title and description, including per-field fallback', async () => {
    const translationRepository = buildTranslationRepository();
    translationRepository.findProductTranslations.mockResolvedValue(
      new Map([['product-1', { title: 'Váy lanh', description: null }]]),
    );
    const repository = new LocalizedStorefrontProductQueryRepository(
      buildDelegate(),
      buildLocalizationService(translationRepository, 'vi-US'),
    );

    const result = await repository.findPublicByShopSlugAndProductSlug(
      'arc-store',
      'product-1-slug',
    );

    expect(result?.title).toBe('Váy lanh');
    expect(result?.description).toBe('Relaxed linen dress');
    expect(result?.slug).toBe('product-1-slug');
  });

  it('localizes suggestions, by-id reads, and card reads', async () => {
    const translationRepository = buildTranslationRepository();
    translationRepository.findProductTranslations.mockResolvedValue(
      new Map([['product-1', { title: 'Váy lanh' }]]),
    );
    const repository = new LocalizedStorefrontProductQueryRepository(
      buildDelegate(),
      buildLocalizationService(translationRepository, 'vi-VN'),
    );

    const suggestions = await repository.suggestPublic({ search: 'dress', limit: 5 });
    const byIds = await repository.findPublicByIds(['product-1']);
    const cards = await repository.findPublicCardsByIds(['product-1']);

    expect(suggestions[0]?.title).toBe('Váy lanh');
    expect(byIds[0]?.title).toBe('Váy lanh');
    expect(cards[0]?.title).toBe('Váy lanh');
    expect(translationRepository.findProductTranslations).toHaveBeenCalledTimes(3);
  });

  it('serves base content for English without querying translations', async () => {
    const translationRepository = buildTranslationRepository();
    const repository = new LocalizedStorefrontProductQueryRepository(
      buildDelegate(),
      buildLocalizationService(translationRepository, 'en-US'),
    );

    const result = await repository.listPublic({ page: 1, limit: 12 });

    expect(result.items.map((item) => item.title)).toEqual([
      'Linen Dress',
      'Silk Scarf',
    ]);
    expect(translationRepository.findProductTranslations).not.toHaveBeenCalled();
  });

  it('leaves facet reads untouched', async () => {
    const translationRepository = buildTranslationRepository();
    const delegate = buildDelegate();
    const repository = new LocalizedStorefrontProductQueryRepository(
      delegate,
      buildLocalizationService(translationRepository, 'vi-VN'),
    );

    await repository.listPublicFacets({ page: 1, limit: 12 });

    expect(delegate.listPublicFacets).toHaveBeenCalledWith({ page: 1, limit: 12 });
    expect(translationRepository.findProductTranslations).not.toHaveBeenCalled();
  });
});

describe('LocalizedProductRecommendationQueryRepository', () => {
  function buildDelegate() {
    const items = [
      buildListItem('product-1', 'Linen Dress'),
      buildListItem('product-2', 'Silk Scarf'),
    ];

    return {
      listPublicByShopSlug: jest.fn().mockResolvedValue(items),
      recommendSimilarPublic: jest.fn().mockResolvedValue(items.slice(0, 1)),
    } satisfies ProductRecommendationQueryRepository;
  }

  it('localizes recommendation sources with one lookup each and preserves slugs', async () => {
    const translationRepository = buildTranslationRepository();
    translationRepository.findProductTranslations.mockResolvedValue(
      new Map([
        ['product-1', { title: 'Váy lanh' }],
        ['product-2', { title: 'Khăn lụa' }],
      ]),
    );
    const repository = new LocalizedProductRecommendationQueryRepository(
      buildDelegate(),
      buildLocalizationService(translationRepository, 'vi-VN'),
    );

    const similar = await repository.recommendSimilarPublic({
      shopSlug: 'arc-store',
      productSlug: 'linen-dress',
      limit: 6,
    });
    const sameSeller = await repository.listPublicByShopSlug({
      shopSlug: 'arc-store',
      excludeProductSlug: 'linen-dress',
      limit: 6,
    });

    expect(similar.map((item) => item.title)).toEqual(['Váy lanh']);
    expect(sameSeller.map((item) => item.title)).toEqual(['Váy lanh', 'Khăn lụa']);
    expect(sameSeller.map((item) => item.slug)).toEqual([
      'product-1-slug',
      'product-2-slug',
    ]);
    expect(translationRepository.findProductTranslations).toHaveBeenCalledTimes(2);
  });
});
