import { ProductState } from '../../domain/enums/product-state.enum';
import { ProductWhoMade } from '../../domain/enums/product-who-made.enum';
import type { CatalogProductDocument } from '../catalog/mongo/documents/catalog-product-document.mapper';
import { toPublicProductDetail as toMongoBasicPublicProductDetail } from './mongo-basic/repositories/mongo-basic-storefront-product-query.repository';
import { toPublicProductDetail as toAtlasPublicProductDetail } from './atlas/repositories/atlas-search-storefront-product-query.repository';

const baseDocument: CatalogProductDocument = {
  _id: 'product-1',
  productId: 'product-1',
  shopId: 'shop-1',
  shopSlug: 'arc-shop',
  shopName: 'Arc Shop',
  slug: 'linen-shirt',
  title: 'Linen Shirt',
  titleNormalized: 'linen shirt',
  description: 'A linen shirt',
  descriptionNormalized: 'a linen shirt',
  state: ProductState.ACTIVE,
  isDigital: false,
  whoMade: ProductWhoMade.I_DID,
  ratingAverage: 0,
  reviewCount: 0,
  images: [],
  options: [{
    id: 'option-color',
    name: 'Color',
    position: 1,
    values: [
      { id: 'value-blue', value: 'Blue', position: 1 },
      { id: 'value-red', value: 'Red', position: 2 },
    ],
  }],
  variants: [
    {
      id: 'variant-blue',
      selections: [{
        optionId: 'option-color',
        optionName: 'Color',
        valueId: 'value-blue',
        value: 'Blue',
      }],
      rank: 1,
    },
    {
      id: 'variant-red',
      selections: [{
        optionId: 'option-color',
        optionName: 'Color',
        valueId: 'value-red',
        value: 'Red',
      }],
      rank: 2,
    },
  ],
  variantCount: 2,
  inventory: [{
    id: 'inventory-blue',
    productVariantId: 'variant-blue',
    stock: 5,
  }],
  attributes: [],
  inferredFacets: [],
  search: { suggest: [], keywords: [] },
  sort: { createdAt: new Date('2026-01-01T00:00:00Z'), inStock: true, popularityScore: 0 },
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  sourceVersion: 1,
};

describe('storefront search product detail option mapping', () => {
  it('keeps catalog options so the storefront renders option selectors', () => {
    expect(toMongoBasicPublicProductDetail(baseDocument).options).toEqual(baseDocument.options);
    expect(toAtlasPublicProductDetail(baseDocument).options).toEqual(baseDocument.options);
  });

  it('reconstructs options from variant selections for already indexed documents', () => {
    const legacyDocument = {
      ...baseDocument,
      options: undefined,
    };

    expect(toMongoBasicPublicProductDetail(legacyDocument).options).toEqual(baseDocument.options);
    expect(toAtlasPublicProductDetail(legacyDocument).options).toEqual(baseDocument.options);
  });
});
