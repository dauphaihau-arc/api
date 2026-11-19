import { buildCatalogLocalizedContent } from './documents/catalog-localized-content';
import { verifyCatalogLocalizedContent } from './localized-content-verification';

function buildDocument(productId: string) {
  return {
    productId,
    title: 'Linen Dress',
    description: 'Relaxed linen dress',
    localized: buildCatalogLocalizedContent({
      title: 'Linen Dress',
      description: 'Relaxed linen dress',
      translations: [{ language: 'vi', title: 'Váy lanh' }],
    }),
  };
}

describe('catalog localization verification', () => {
  it('reports zero stale language fields for reprojected documents', () => {
    const report = verifyCatalogLocalizedContent([
      buildDocument('product-1'),
      buildDocument('product-2'),
    ]);

    expect(report).toMatchObject({
      totalDocuments: 2,
      staleDocuments: 0,
      staleFields: 0,
      issues: [],
    });
  });

  it('flags documents written before localized fields existed', () => {
    const report = verifyCatalogLocalizedContent([{
      productId: 'legacy-product',
      title: 'Linen Dress',
      description: 'Relaxed linen dress',
    }]);

    expect(report.staleDocuments).toBe(1);
    expect(report.issues[0]?.fields).toEqual(
      expect.arrayContaining(['localized.en', 'localized.vi']),
    );
  });

  it('flags stale normalized fields after a display value changes', () => {
    const document = buildDocument('product-1');
    document.localized.vi.title = 'Váy lanh mới';

    const report = verifyCatalogLocalizedContent([document]);

    expect(report.staleDocuments).toBe(1);
    expect(report.issues[0]?.fields).toContain('localized.vi.titleNormalized');
  });
});
