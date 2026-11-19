import {
  buildCatalogLocalizedContent,
  normalizeCatalogSearchText,
  resolveCatalogLocalizedContent,
} from './catalog-localized-content';

describe('catalog localized content', () => {
  it('folds Vietnamese diacritics for search fields', () => {
    expect(normalizeCatalogSearchText('Váy Lanh Đẹp')).toBe('vay lanh dep');
    expect(normalizeCatalogSearchText('  Váy   lanh  ')).toBe('vay lanh');
  });

  it('resolves each supported language and falls back per field', () => {
    const localized = buildCatalogLocalizedContent({
      title: 'Linen Dress',
      description: 'Relaxed linen dress',
      categoryName: 'Dresses',
      suggestTerms: ['Small'],
      keywordTerms: ['Olive Atelier'],
      translations: [{
        language: 'vi',
        title: 'Váy lanh',
        description: null,
      }],
      categoryTranslations: [{
        language: 'vi',
        name: 'Váy đầm',
      }],
    });

    expect(localized.en).toMatchObject({
      title: 'Linen Dress',
      titleNormalized: 'linen dress',
      descriptionNormalized: 'relaxed linen dress',
      categoryName: 'Dresses',
    });
    expect(localized.vi).toMatchObject({
      title: 'Váy lanh',
      titleNormalized: 'vay lanh',
      description: 'Relaxed linen dress',
      descriptionNormalized: 'relaxed linen dress',
      categoryName: 'Váy đầm',
      categoryNameNormalized: 'vay dam',
    });
    expect(localized.vi.suggest).toEqual(expect.arrayContaining(['vay lanh', 'small']));
    expect(localized.vi.keywords).toEqual(
      expect.arrayContaining(['vay lanh', 'relaxed linen dress', 'olive atelier']),
    );
  });

  it('keeps English searchable when Vietnamese content is missing', () => {
    const localized = buildCatalogLocalizedContent({
      title: 'Linen Dress',
      description: 'Relaxed linen dress',
      translations: [],
    });

    expect(localized.vi.title).toBe('Linen Dress');
    expect(localized.vi.titleNormalized).toBe('linen dress');
    expect(localized.vi.keywords).toEqual(
      expect.arrayContaining(['linen dress', 'relaxed linen dress']),
    );
  });

  it('falls back to legacy top-level fields before a reindex', () => {
    const content = resolveCatalogLocalizedContent({
      title: 'Linen Dress',
      description: 'Relaxed linen dress',
      search: { suggest: ['linen dress'], keywords: ['linen dress'] },
    }, 'vi');

    expect(content).toMatchObject({
      title: 'Linen Dress',
      titleNormalized: 'linen dress',
      description: 'Relaxed linen dress',
      suggest: ['linen dress'],
    });
  });

  it('reads the requested language from a projected document', () => {
    const document = {
      title: 'Linen Dress',
      description: 'Relaxed linen dress',
      localized: buildCatalogLocalizedContent({
        title: 'Linen Dress',
        description: 'Relaxed linen dress',
        translations: [{ language: 'vi', title: 'Váy lanh' }],
      }),
    };

    expect(resolveCatalogLocalizedContent(document, 'vi').title).toBe('Váy lanh');
  });
});
