import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { ProductTranslationEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-translation.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { resolveLocalizedValue } from './storefront-language';
import { categorySeedData } from '../../../database/seeds/category.data';
import {
  assertCategoryTranslationCoverage,
  categoryTranslationSeeds,
  collectCategorySeedPaths,
  readCategoryTranslationSeeds,
} from '../../../database/seeds/category-translation.seed-loader';
import {
  seedProductTranslations,
  validateLocalizedContentSeeds,
} from '../../../database/seeds/localized-content.seed';
import {
  assertProductTranslationCoverage,
  assertProductTranslationReferences,
  productTranslationSeeds,
  readProductTranslationSeeds,
} from '../../../database/seeds/product-translation.seed-loader';

const PRODUCT_TRANSLATION_HEADER =
  'shop_slug\tproduct_title\tlanguage\ttitle\tdescription';
const CATEGORY_TRANSLATION_HEADER = 'category_path\tlanguage\tname';

describe('localized content seed loaders', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'localized-content-seed-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeTsv(name: string, contents: string): string {
    const filePath = join(tempDir, name);
    writeFileSync(filePath, `${contents}\n`, 'utf8');
    return filePath;
  }

  it('loads curated Vietnamese content for every shared product and category', () => {
    expect(() => validateLocalizedContentSeeds()).not.toThrow();

    expect(productTranslationSeeds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          shopSlug: 'olive-atelier',
          productTitle: 'Linen Weekend Dress',
          language: 'vi',
          title: 'Váy linen cuối tuần',
        }),
      ]),
    );

    for (const translation of productTranslationSeeds) {
      expect(translation.language).toBe('vi');
      expect(translation.title.trim()).not.toHaveLength(0);
      expect(translation.description.trim()).not.toHaveLength(0);
    }

    expect(categoryTranslationSeeds).toHaveLength(
      collectCategorySeedPaths(categorySeedData).length,
    );
    expect(categoryTranslationSeeds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          categoryPath: ['Fashion', 'Women\'s Fashion', 'Dresses'],
          language: 'vi',
          name: 'Váy đầm',
        }),
      ]),
    );
  });

  it('lets local rows replace shared product and category translations', () => {
    const sharedProducts = writeTsv(
      'product-translations.tsv',
      [
        PRODUCT_TRANSLATION_HEADER,
        'olive-atelier\tLinen Weekend Dress\tvi\tTiêu đề gốc\tMô tả gốc',
      ].join('\n'),
    );
    const localProducts = writeTsv(
      'product-translations.local.tsv',
      [
        PRODUCT_TRANSLATION_HEADER,
        'olive-atelier\tLinen Weekend Dress\tvi\tTiêu đề thay thế\tMô tả thay thế',
      ].join('\n'),
    );

    expect(readProductTranslationSeeds(sharedProducts, localProducts)).toEqual([
      {
        shopSlug: 'olive-atelier',
        productTitle: 'Linen Weekend Dress',
        language: 'vi',
        title: 'Tiêu đề thay thế',
        description: 'Mô tả thay thế',
      },
    ]);

    const sharedCategories = writeTsv(
      'category-translations.tsv',
      [CATEGORY_TRANSLATION_HEADER, 'Fashion > Dresses\tvi\tVáy đầm'].join('\n'),
    );
    const localCategories = writeTsv(
      'category-translations.local.tsv',
      [CATEGORY_TRANSLATION_HEADER, 'Fashion > Dresses\tvi\tĐầm nữ'].join('\n'),
    );

    expect(readCategoryTranslationSeeds(sharedCategories, localCategories)).toEqual([
      {
        categoryPath: ['Fashion', 'Dresses'],
        language: 'vi',
        name: 'Đầm nữ',
      },
    ]);
  });

  it('rejects malformed rows, unsupported languages, and duplicate record languages', () => {
    const malformed = writeTsv(
      'malformed.tsv',
      [PRODUCT_TRANSLATION_HEADER, 'olive-atelier\tLinen Weekend Dress\tvi\t\tMô tả'].join('\n'),
    );
    const unsupportedLanguage = writeTsv(
      'unsupported-language.tsv',
      [PRODUCT_TRANSLATION_HEADER, 'olive-atelier\tLinen Weekend Dress\tfr\tTitre\tDescription'].join('\n'),
    );
    const duplicate = writeTsv(
      'duplicate.tsv',
      [
        PRODUCT_TRANSLATION_HEADER,
        'olive-atelier\tLinen Weekend Dress\tvi\tTiêu đề\tMô tả',
        'olive-atelier\tLinen Weekend Dress\tvi\tTiêu đề khác\tMô tả khác',
      ].join('\n'),
    );

    expect(() => readProductTranslationSeeds(malformed, '')).toThrow(/Missing title/);
    expect(() => readProductTranslationSeeds(unsupportedLanguage, '')).toThrow(
      /Unsupported language/,
    );
    expect(() => readProductTranslationSeeds(duplicate, '')).toThrow(/Duplicate product translation/);
  });

  it('requires Vietnamese coverage except for explicit English-only exceptions', () => {
    const sharedProduct = { shopSlug: 'olive-atelier', title: 'Linen Weekend Dress', state: 'active' };
    const translatedProduct = {
      shopSlug: 'olive-atelier',
      productTitle: 'Linen Weekend Dress',
      language: 'vi' as const,
      title: 'Váy linen cuối tuần',
      description: 'Mô tả',
    };

    expect(() =>
      assertProductTranslationCoverage([translatedProduct], [sharedProduct]),
    ).not.toThrow();
    expect(() =>
      assertProductTranslationCoverage([], [sharedProduct]),
    ).toThrow(/Missing Vietnamese product translation/);
    expect(() =>
      assertProductTranslationCoverage(
        [],
        [sharedProduct],
        new Set(['olive-atelier::Linen Weekend Dress']),
      ),
    ).not.toThrow();
    expect(() =>
      assertProductTranslationReferences(
        [{ ...translatedProduct, productTitle: 'Missing Product' }],
        [sharedProduct],
      ),
    ).toThrow(/unknown product/);

    // An English-only exception has no vi row, so storefront reads fall back.
    expect(resolveLocalizedValue('vi', 'Linen Weekend Dress', undefined)).toBe(
      'Linen Weekend Dress',
    );

    const categoryTree = [
      {
        name: 'Fashion',
        rank: 1,
        children: [{ name: 'Dresses', rank: 1 }],
      },
    ];
    const vietnameseCategoryTranslations = [
      { categoryPath: ['Fashion'], language: 'vi' as const, name: 'Thời trang' },
      { categoryPath: ['Fashion', 'Dresses'], language: 'vi' as const, name: 'Váy đầm' },
    ];
    expect(() =>
      assertCategoryTranslationCoverage(vietnameseCategoryTranslations, categoryTree),
    ).not.toThrow();
    expect(() =>
      assertCategoryTranslationCoverage(
        [vietnameseCategoryTranslations[1]],
        categoryTree,
      ),
    ).toThrow(/Missing Vietnamese category translation for "Fashion"/);
    expect(() =>
      assertCategoryTranslationCoverage(
        [],
        categoryTree,
        new Set(['Fashion', 'Fashion > Dresses']),
      ),
    ).not.toThrow();
    expect(() =>
      assertCategoryTranslationCoverage(
        [{ categoryPath: ['Fashion', 'Missing'], language: 'vi', name: 'Không tồn tại' }],
        [{ name: 'Fashion', rank: 1, children: [{ name: 'Dresses', rank: 1 }] }],
      ),
    ).toThrow(/unknown category path/);
  });

  it('upserts product translations without calling a translation provider', async () => {
    const shop = { slug: 'olive-atelier' };
    const product = { id: 'product-1', title: 'Linen Weekend Dress', shop };
    const entityManager = {
      find: jest.fn(async (entity: unknown) => {
        if (entity === ShopEntity) {
          return [shop];
        }
        if (entity === ProductEntity) {
          return [product];
        }
        return [];
      }),
      create: jest.fn((_entity: unknown, data: Record<string, unknown>) => ({ ...data })),
      persist: jest.fn(),
      flush: jest.fn(async () => undefined),
    };
    const originalFetch = globalThis.fetch;
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      await seedProductTranslations(entityManager as never, [
        {
          shopSlug: 'olive-atelier',
          productTitle: 'Linen Weekend Dress',
          language: 'vi',
          title: 'Váy linen cuối tuần',
          description: 'Váy linen dáng suông nhẹ nhàng.',
        },
      ]);
    }
    finally {
      globalThis.fetch = originalFetch;
    }

    expect(fetchMock).not.toHaveBeenCalled();
    expect(entityManager.create).toHaveBeenCalledWith(
      ProductTranslationEntity,
      expect.objectContaining({
        product,
        language: 'vi',
        title: 'Váy linen cuối tuần',
      }),
    );
  });
});
