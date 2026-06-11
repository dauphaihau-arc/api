import { ProductImageVariant } from '../domain/enums/product-image-variant.enum';
import { ProductImageVariantStatus } from '../domain/enums/product-image-variant-status.enum';
import { ProductState } from '../domain/enums/product-state.enum';
import { ProductVariantType } from '../domain/enums/product-variant-type.enum';
import { ProductWhoMade } from '../domain/enums/product-who-made.enum';
import { toCatalogSearchDocument } from './catalog-search-document.mapper';

describe('catalog-search-document.mapper', () => {
  it('maps a loaded product aggregate into a flatter search document', () => {
    const product = {
      id: 'product-1',
      createdAt: new Date('2026-06-11T01:00:00.000Z'),
      updatedAt: new Date('2026-06-11T02:00:00.000Z'),
      publishedAt: new Date('2026-06-11T02:00:00.000Z'),
      slug: 'linen-weekend-dress',
      title: 'Linen Weekend Dress',
      description: 'Relaxed linen dress',
      state: ProductState.ACTIVE,
      isDigital: false,
      whoMade: ProductWhoMade.I_DID,
      variantType: ProductVariantType.SINGLE,
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
          variantStatus: ProductImageVariantStatus.READY,
          variants: {
            length: 1,
            getItems: () => [{
              variant: ProductImageVariant.CARD_1X1,
              storageKey: 'products/olive-atelier/linen-weekend-dress/card.webp',
            }],
          },
        }],
      },
      variants: {
        getItems: () => [{
          id: 'variant-1',
          name: 'Small',
          optionValue1: 'Small',
          optionValue2: undefined,
          rank: 1,
        }],
      },
      inventoryRecords: {
        getItems: () => [{
          id: 'inventory-1',
          sku: 'SKU-1',
          stock: 12,
          productVariant: {
            id: 'variant-1',
            rank: 1,
          },
          prices: {
            getItems: () => [{
              amountMinor: 7900,
              originalAmountMinor: 9900,
              currency: 'USD',
            }],
          },
        }],
      },
    } as never;

    const document = toCatalogSearchDocument(
      product,
      (storageKey) => `https://cdn.example.test/${storageKey}`
    );

    expect(document).toMatchObject({
      productId: 'product-1',
      shopSlug: 'olive-atelier',
      title: 'Linen Weekend Dress',
      state: ProductState.ACTIVE,
      inventory: {
        inStock: true,
        totalStock: 12,
      },
      price: {
        minAmountMinor: 7900,
        maxAmountMinor: 7900,
        currency: 'USD',
      },
      media: {
        primaryImageUrl: 'https://cdn.example.test/products/olive-atelier/linen-weekend-dress/main.png',
      },
      flags: {
        hasImages: true,
      },
      ranking: {
        popularityScore: 18,
      },
    });

    expect(document.suggest).toEqual(
      expect.arrayContaining(['linen weekend dress', 'small'])
    );
    expect(document.keywords).toEqual(
      expect.arrayContaining(['linen weekend dress', 'relaxed linen dress', 'olive atelier'])
    );
  });
});
