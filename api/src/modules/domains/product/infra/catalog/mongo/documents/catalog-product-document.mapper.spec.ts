import { ProductState } from '../domain/enums/product-state.enum';
import { ProductVariantType } from '../domain/enums/product-variant-type.enum';
import { ProductWhoMade } from '../domain/enums/product-who-made.enum';
import { ProductImageVariant } from '../domain/enums/product-image-variant.enum';
import { ProductImageVariantStatus } from '../domain/enums/product-image-variant-status.enum';
import { ProductShippingCharge } from '../domain/enums/product-shipping-charge.enum';
import { toCatalogProductDocument } from './catalog-product-document.mapper';

describe('catalog-product-document.mapper', () => {
  it('maps a loaded product aggregate into a denormalized catalog document', () => {
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
      variantGroupName: 'Size',
      variantSubGroupName: undefined,
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
          variantError: undefined,
          variantsGeneratedAt: new Date('2026-06-11T02:10:00.000Z'),
          variants: {
            length: 1,
            getItems: () => [{
              variant: ProductImageVariant.CARD_1X1,
              storageKey: 'products/olive-atelier/linen-weekend-dress/card.webp',
              width: 640,
              height: 640,
              format: 'webp',
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
          imageStorageKey: undefined,
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
      shippingProfiles: [{
        originCountry: 'US',
        processTimeLabel: '1-3 business days',
        destinations: {
          getItems: () => [{
            id: 'dest-1',
            countryCode: 'US',
            deliveryTimeLabel: '3-5 business days',
            service: 'Standard',
            chargeType: ProductShippingCharge.FIXED_PRICE,
            rank: 1,
          }],
        },
      }],
      attributeValues: {
        getItems: () => [{
          categoryAttribute: {
            id: 'attribute-1',
            name: 'Material',
            rank: 1,
          },
          selectedOption: {
            id: 'option-linen',
            value: 'Linen',
          },
          selectedText: undefined,
        }],
      },
    } as never;

    const document = toCatalogProductDocument(
      product,
      (storageKey) => `https://cdn.example.test/${storageKey}`
    );

    expect(document).toMatchObject({
      productId: 'product-1',
      shopSlug: 'olive-atelier',
      title: 'Linen Weekend Dress',
      titleNormalized: 'linen weekend dress',
      primaryImage: {
        storageKey: 'products/olive-atelier/linen-weekend-dress/card.webp',
        variant: ProductImageVariant.CARD_1X1,
      },
      primaryInventory: {
        id: 'inventory-1',
        amountMinor: 7900,
        originalAmountMinor: 9900,
        currency: 'USD',
        stock: 12,
      },
      sort: {
        minPriceAmountMinor: 7900,
        maxPriceAmountMinor: 7900,
        inStock: true,
        popularityScore: 18,
      },
      shipping: {
        originCountry: 'US',
      },
      attributes: [{
        categoryAttributeId: 'attribute-1',
        categoryAttributeName: 'Material',
        selectedOptionId: 'option-linen',
        selectedOptionValue: 'Linen',
      }],
    });

    expect(document.images[0]?.url).toBe(
      'https://cdn.example.test/products/olive-atelier/linen-weekend-dress/main.png'
    );
    expect(document.search.keywords).toEqual(
      expect.arrayContaining(['linen weekend dress', 'olive atelier', 'small'])
    );
    expect(document.search.suggest).toEqual(
      expect.arrayContaining(['linen weekend dress', 'small'])
    );
  });
});
