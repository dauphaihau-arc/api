import { ProductState } from '../domain/enums/product-state.enum';
import { MongoStorefrontProductQueryRepository } from './mongo-storefront-product-query.repository';
import type { CatalogProductDocument } from './catalog-product-document.mapper';
import type { CatalogProductSlugRepository } from '../app/ports/catalog-product-slug.repository';
import type { CatalogMongoAccess } from './catalog-mongo.access';

describe('MongoStorefrontProductQueryRepository', () => {
  const sampleDocument: CatalogProductDocument = {
    _id: 'product-1',
    productId: 'product-1',
    shopId: 'shop-1',
    shopPublicId: 'shop-pub-1',
    shopSlug: 'olive-atelier',
    shopName: 'Olive Atelier',
    categoryId: 'category-1',
    slug: 'linen-weekend-dress',
    title: 'Linen Weekend Dress',
    titleNormalized: 'linen weekend dress',
    description: 'Relaxed linen dress',
    descriptionNormalized: 'relaxed linen dress',
    state: ProductState.ACTIVE,
    isDigital: false,
    whoMade: 'i_did' as never,
    variantType: 'single' as never,
    variantGroupName: 'Size',
    variantSubGroupName: undefined,
    images: [{
      id: 'image-1',
      storageKey: 'products/.../main.png',
      url: 'https://cdn.example.test/products/.../main.png',
      rank: 1,
      variantStatus: 'ready',
      variants: {
        card_1x1: {
          storageKey: 'products/.../card.webp',
          url: 'https://cdn.example.test/products/.../card.webp',
          width: 640,
          height: 640,
          format: 'webp',
        },
      },
    }],
    primaryImage: {
      storageKey: 'products/.../card.webp',
      variant: 'card_1x1',
      variants: {
        card_1x1: {
          storageKey: 'products/.../card.webp',
        },
      },
    },
    variants: [{
      id: 'variant-1',
      name: 'Small',
      optionValue1: 'Small',
      rank: 1,
    }],
    inventory: [{
      id: 'inventory-1',
      productVariantId: 'variant-1',
      sku: 'SKU-1',
      stock: 12,
      amountMinor: 7900,
      originalAmountMinor: 9900,
      currency: 'USD',
    }],
    primaryInventory: {
      id: 'inventory-1',
      productVariantId: 'variant-1',
      sku: 'SKU-1',
      stock: 12,
      amountMinor: 7900,
      originalAmountMinor: 9900,
      currency: 'USD',
    },
    shipping: {
      originCountry: 'US',
      processTimeLabel: '1-3 business days',
      destinations: [{
        id: 'dest-1',
        countryCode: 'US',
        deliveryTimeLabel: '3-5 business days',
        service: 'Standard',
        chargeType: 'fixed_price',
        rank: 1,
      }],
    },
    search: {
      suggest: ['linen weekend dress'],
      keywords: ['linen weekend dress', 'olive atelier'],
    },
    sort: {
      createdAt: new Date('2026-06-11T01:00:00.000Z'),
      minPriceAmountMinor: 7900,
      maxPriceAmountMinor: 7900,
      inStock: true,
      popularityScore: 18,
    },
    publishedAt: new Date('2026-06-11T02:00:00.000Z'),
    updatedAt: new Date('2026-06-11T02:00:00.000Z'),
    sourceVersion: 1718071200000,
  };

  function createRepository(documents: CatalogProductDocument[]) {
    const repository = new MongoStorefrontProductQueryRepository({
      driver: 'mongodb',
      searchDriver: 'mongodb',
      mongodbUri: 'mongodb://127.0.0.1:27017',
      mongodbDbName: 'arc_catalog',
      mongodbProductsCollection: 'catalog_products',
      mongodbSlugsCollection: 'catalog_product_slugs',
      mongodbSearchCollection: 'catalog_product_search',
    }, {
      findProductIdByShopAndSlug: jest.fn(async (shopSlug: string, productSlug: string) =>
        documents.find((document) =>
          document.shopSlug === shopSlug && document.slug === productSlug
        )?.productId ?? null
      ),
    } as unknown as CatalogProductSlugRepository, {
      getCollection: jest.fn(),
    } as unknown as CatalogMongoAccess);

    const fakeCollection = {
      findOne: jest.fn(async (filter: Record<string, unknown>) =>
        documents.find((document) =>
          Object.entries(filter).every(([key, value]) => document[key as keyof CatalogProductDocument] === value)
        ) ?? null
      ),
      countDocuments: jest.fn(async (filter: Record<string, unknown>) =>
        applyFilter(documents, filter).length
      ),
      find: jest.fn((filter: Record<string, unknown>) => createCursor(applyFilter(documents, filter))),
    };

    jest.spyOn(repository as any, 'getCollection').mockResolvedValue(fakeCollection as never);

    return { repository, fakeCollection };
  }

  it('returns public product detail by shop slug and product slug', async () => {
    const { repository } = createRepository([sampleDocument]);

    const result = await repository.findPublicByShopSlugAndProductSlug(
      'olive-atelier',
      'linen-weekend-dress'
    );

    expect(result).toMatchObject({
      id: 'product-1',
      shop: {
        slug: 'olive-atelier',
      },
      inventory: [{
        id: 'inventory-1',
        amountMinor: 7900,
      }],
    });
  });

  it('lists public products with newest ordering', async () => {
    const newerDocument = {
      ...sampleDocument,
      _id: 'product-2',
      productId: 'product-2',
      slug: 'canvas-market-tote',
      title: 'Canvas Market Tote',
      titleNormalized: 'canvas market tote',
      sort: {
        ...sampleDocument.sort,
        createdAt: new Date('2026-06-12T01:00:00.000Z'),
      },
    };
    const { repository } = createRepository([sampleDocument, newerDocument]);

    const result = await repository.listPublic({
      page: 1,
      limit: 10,
      order: 'newest',
    });

    expect(result.meta.total).toBe(2);
    expect(result.items.map((item) => item.id)).toEqual(['product-2', 'product-1']);
  });

  it('suggests products ordered by title relevance', async () => {
    const exact = sampleDocument;
    const prefix = {
      ...sampleDocument,
      _id: 'product-2',
      productId: 'product-2',
      slug: 'linen-bag',
      title: 'Linen Bag',
      titleNormalized: 'linen bag',
      search: {
        suggest: ['linen bag'],
        keywords: ['linen bag'],
      },
    };
    const { repository } = createRepository([prefix, exact]);

    const result = await repository.suggestPublic({
      search: 'linen weekend dress',
      limit: 5,
    });

    expect(result.map((item) => item.id)).toEqual(['product-1', 'product-2']);
  });
});

function createCursor(documents: CatalogProductDocument[]) {
  let items = documents.slice();

  return {
    sort(sortDefinition: Record<string, 1 | -1>) {
      const [field, direction] = Object.entries(sortDefinition)[0] ?? [];
      if (field) {
        items = items.slice().sort((left, right) => compareByPath(left, right, field, direction));
      }
      return this;
    },
    skip(value: number) {
      items = items.slice(value);
      return this;
    },
    limit(value: number) {
      items = items.slice(0, value);
      return this;
    },
    async toArray() {
      return items;
    },
  };
}

function compareByPath(
  left: CatalogProductDocument,
  right: CatalogProductDocument,
  field: string,
  direction: 1 | -1
): number {
  const leftValue = getByPath(left, field);
  const rightValue = getByPath(right, field);

  if (leftValue instanceof Date && rightValue instanceof Date) {
    return direction * (leftValue.getTime() - rightValue.getTime());
  }

  if (typeof leftValue === 'number' && typeof rightValue === 'number') {
    return direction * (leftValue - rightValue);
  }

  if (String(leftValue) < String(rightValue)) {
    return -1 * direction;
  }

  if (String(leftValue) > String(rightValue)) {
    return 1 * direction;
  }

  return 0;
}

function getByPath(document: CatalogProductDocument, field: string): unknown {
  return field.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    return (value as Record<string, unknown>)[segment];
  }, document);
}

function applyFilter(
  documents: CatalogProductDocument[],
  filter: Record<string, unknown>
): CatalogProductDocument[] {
  return documents.filter((document) => matchesFilter(document, filter));
}

function matchesFilter(
  document: CatalogProductDocument,
  filter: Record<string, unknown>
): boolean {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$and') {
      return (value as Array<Record<string, unknown>>).every((entry) =>
        matchesFilter(document, entry)
      );
    }

    if (key === '$or') {
      return (value as Array<Record<string, unknown>>).some((entry) =>
        matchesFilter(document, entry)
      );
    }

    const actualValue = getByPath(document, key);

    if (value && typeof value === 'object' && '$in' in (value as Record<string, unknown>)) {
      return ((value as { $in: unknown[] }).$in).includes(actualValue);
    }

    if (value && typeof value === 'object' && '$regex' in (value as Record<string, unknown>)) {
      return new RegExp(String((value as { $regex: unknown }).$regex)).test(String(actualValue ?? ''));
    }

    if (value && typeof value === 'object' && '$elemMatch' in (value as Record<string, unknown>)) {
      const arrayValue = actualValue as unknown[];
      if (!Array.isArray(arrayValue)) {
        return false;
      }

      const matcher = (value as { $elemMatch: { $regex: unknown } }).$elemMatch;
      return arrayValue.some((entry) =>
        new RegExp(String(matcher.$regex)).test(String(entry))
      );
    }

    return actualValue === value;
  });
}
