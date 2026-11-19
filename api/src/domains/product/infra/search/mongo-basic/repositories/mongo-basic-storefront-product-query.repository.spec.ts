import type { CatalogConfig } from '~/platform/config/catalog.config';
import type { StorefrontPricingConfig } from '~/platform/config/storefront-pricing.config';
import { MongoBasicStorefrontProductQueryRepository } from './mongo-basic-storefront-product-query.repository';
import { buildCatalogLocalizedContent } from '../../../catalog/mongo/documents/catalog-localized-content';

function buildDocument(languageTitle?: string) {
  return {
    _id: 'product-1',
    productId: 'product-1',
    productPublicId: 'public-product-1',
    shopId: 'shop-1',
    shopPublicId: 'public-shop-1',
    shopSlug: 'olive-atelier',
    shopName: 'Olive Atelier',
    slug: 'linen-dress',
    title: 'Linen Dress',
    description: 'Relaxed linen dress',
    state: 'active',
    categoryId: 'category-1',
    categoryPublicId: '1',
    variantCount: 1,
    image: undefined,
    price: { minAmountMinor: 1000, maxAmountMinor: 1000, currency: 'USD' },
    inventory: { inStock: true, totalStock: 3 },
    ranking: { popularityScore: 1, createdAt: new Date('2026-01-01T00:00:00.000Z') },
    localized: buildCatalogLocalizedContent({
      title: 'Linen Dress',
      description: 'Relaxed linen dress',
      translations: languageTitle ? [{ language: 'vi', title: languageTitle }] : [],
    }),
  };
}

function serializeWithRegex(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) =>
    nested instanceof RegExp ? nested.source : nested);
}

function createRepository(locale: string | undefined, documents: ReturnType<typeof buildDocument>[]) {
  const findFilters: Record<string, unknown>[] = [];
  const cursor = {
    sort: () => cursor,
    skip: () => cursor,
    limit: () => cursor,
    toArray: async () => documents,
  };
  const collection = {
    find: (filter: Record<string, unknown>) => {
      findFilters.push(filter);
      return cursor;
    },
    countDocuments: async () => documents.length,
    findOne: async () => null,
    aggregate: () => ({ toArray: async () => [] }),
  };

  const repository = new MongoBasicStorefrontProductQueryRepository(
    {
      searchDriver: 'mongo-basic',
      mongodbSearchCollection: 'catalog_product_search',
    } as CatalogConfig,
    { indexedPricePairs: [], rarePriceCacheTtlMs: 0 } as StorefrontPricingConfig,
    {} as never,
    {} as never,
    { getCollection: async () => collection } as never,
    { resolveCurrentRequest: async () => undefined } as never,
    { get: () => ({ locale }) } as never,
    { overlayDetail: (detail: unknown) => detail } as never,
  );

  return { repository, findFilters };
}

describe('MongoBasicStorefrontProductQueryRepository locale selection', () => {
  it.each(['vi-VN', 'vi-US'])(
    'queries Vietnamese fields for %s',
    async (locale) => {
      const { repository, findFilters } = createRepository(locale, [buildDocument('Váy lanh')]);

      await repository.listPublic({ page: 1, limit: 12, search: 'vay' });

      const serialized = serializeWithRegex(findFilters[0]);
      expect(serialized).toContain('localized.vi.titleNormalized');
      expect(serialized).toContain('localized.vi.descriptionNormalized');
      expect(serialized).toContain('vay');
      expect(serialized).not.toContain('localized.en.titleNormalized');
    },
  );

  it('queries English fields for an absent or English locale', async () => {
    for (const locale of [undefined, 'en-US']) {
      const { repository, findFilters } = createRepository(locale, [buildDocument('Váy lanh')]);

      await repository.listPublic({ page: 1, limit: 12, search: 'linen' });

      expect(serializeWithRegex(findFilters[0])).toContain('localized.en.titleNormalized');
    }
  });

  it('returns localized list item titles', async () => {
    const { repository } = createRepository('vi-VN', [buildDocument('Váy lanh')]);

    const result = await repository.listPublic({ page: 1, limit: 12 });

    expect(result.items[0]?.title).toBe('Váy lanh');
    expect(result.items[0]?.slug).toBe('linen-dress');
  });

  it('returns localized suggestion titles', async () => {
    const { repository } = createRepository('vi-VN', [buildDocument('Váy lanh')]);

    const suggestions = await repository.suggestPublic({ search: 'vay', limit: 5 });

    expect(suggestions[0]?.title).toBe('Váy lanh');
    expect(suggestions[0]?.slug).toBe('linen-dress');
  });

  it('keeps English suggestions when Vietnamese content is missing', async () => {
    const { repository } = createRepository('vi-VN', [buildDocument()]);

    const suggestions = await repository.suggestPublic({ search: 'linen', limit: 5 });

    expect(suggestions[0]?.title).toBe('Linen Dress');
  });
});
