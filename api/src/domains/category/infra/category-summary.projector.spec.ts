import type { StorageService } from '~/integrations/storage/app/ports/storage.service';
import type { CategoryTranslationEntity } from './persistence/entities/category-translation.entity';
import type { CategoryEntity } from './persistence/entities/category.entity';
import { resolveCategoryName, toCategorySummary } from './category-summary.projector';

const storageService = {
  getPublicUrl: (key: string) => `https://cdn.example.com/${key}`,
} as unknown as StorageService;

function buildCategory(options: {
  name: string;
  slug?: string;
  translations?: Array<{ language: 'en' | 'vi'; name?: string }>;
  initialized?: boolean;
}): CategoryEntity {
  const translations = options.translations ?? [];

  return {
    id: 'category-internal-1',
    publicId: '34',
    slug: options.slug ?? 'ceramic-mugs',
    name: options.name,
    rank: 1,
    translations: {
      isInitialized: () => options.initialized ?? true,
      getItems: () =>
        translations as unknown as CategoryTranslationEntity[],
    },
    attributes: { getItems: () => [] },
  } as unknown as CategoryEntity;
}

describe('resolveCategoryName', () => {
  it('keeps the English base name for English even when a translation exists', () => {
    const category = buildCategory({
      name: 'Ceramic mugs',
      translations: [{ language: 'vi', name: 'Cốc gốm' }],
    });

    expect(resolveCategoryName(category, 'en')).toBe('Ceramic mugs');
  });

  it('returns the Vietnamese translated name', () => {
    const category = buildCategory({
      name: 'Ceramic mugs',
      translations: [{ language: 'vi', name: 'Cốc gốm' }],
    });

    expect(resolveCategoryName(category, 'vi')).toBe('Cốc gốm');
  });

  it('falls back to the English base name when the Vietnamese row is absent', () => {
    const category = buildCategory({ name: 'Ceramic mugs' });

    expect(resolveCategoryName(category, 'vi')).toBe('Ceramic mugs');
  });

  it('falls back to the English base name when the Vietnamese value is null', () => {
    const category = buildCategory({
      name: 'Ceramic mugs',
      translations: [{ language: 'vi', name: undefined }],
    });

    expect(resolveCategoryName(category, 'vi')).toBe('Ceramic mugs');
  });

  it('falls back when translations were not populated', () => {
    const category = buildCategory({ name: 'Ceramic mugs', initialized: false });

    expect(resolveCategoryName(category, 'vi')).toBe('Ceramic mugs');
  });
});

describe('toCategorySummary', () => {
  it('localizes the name while keeping the slug unchanged', () => {
    const category = buildCategory({
      name: 'Ceramic mugs',
      slug: 'ceramic-mugs',
      translations: [{ language: 'vi', name: 'Cốc gốm' }],
    });

    const summary = toCategorySummary(category, storageService, 'vi');

    expect(summary.name).toBe('Cốc gốm');
    expect(summary.slug).toBe('ceramic-mugs');
  });

  it('defaults to the English base name when no language is provided', () => {
    const category = buildCategory({
      name: 'Ceramic mugs',
      translations: [{ language: 'vi', name: 'Cốc gốm' }],
    });

    expect(toCategorySummary(category, storageService).name).toBe('Ceramic mugs');
  });
});
