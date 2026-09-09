import { ConflictException } from '@nestjs/common';
import { ProductConfigurationConflictError, ProductVersionConflictError } from '~/domains/product/app/errors/product-app.error';
import { mapProductAppErrorToHttpException } from './product-http-error-mapper';

describe('mapProductAppErrorToHttpException', () => {
  it('serializes version conflict current_product as the shop detail API shape', () => {
    const exception = mapProductAppErrorToHttpException(new ProductVersionConflictError({
      id: 'product-1',
      shopId: 'shop-1',
      productVersion: 6,
      state: 'active',
      title: 'Published shoes',
      slug: 'published-shoes',
      description: 'Published shoes',
      whoMade: 'i_did',
      isDigital: false,
      nonTaxable: false,
      tags: [],
      images: [],
      attributes: [],
      variants: [{
        id: 'variant-eight',
        rank: 1,
        lifecycleState: 'active',
        selections: [],
      }],
      inventory: [{
        id: 'inventory-eight',
        productVariantId: 'variant-eight',
        sku: 'SIZE-8',
        stock: 4,
        onHandQuantity: 4,
        reservedQuantity: 0,
        availableQuantity: 4,
        onHandVersion: 3,
        shortage: 0,
        amountMinor: 1000,
        currency: 'USD',
      }],
    } as never));

    expect(exception).toBeInstanceOf(ConflictException);
    expect(exception.getResponse()).toMatchObject({
      code: 'ProductVersionConflictError',
      product_version: 6,
      current_product: {
        id: 'product-1',
        product_version: 6,
        variants: [{
          id: 'variant-eight',
          rank: 1,
        }],
        inventory: [{
          id: 'inventory-eight',
          product_variant_id: 'variant-eight',
          amount_minor: 1000,
          currency: 'USD',
          on_hand_version: 3,
        }],
      },
    });
  });

  it('serializes SKU conflicts with row-level SKU details', () => {
    const exception = mapProductAppErrorToHttpException(new ProductConfigurationConflictError(
      'ProductSkuConflict',
      ['inventory-eight'],
      {
        id: 'product-1',
        shopId: 'shop-1',
        productVersion: 6,
        state: 'active',
        title: 'Published shoes',
        slug: 'published-shoes',
        description: 'Published shoes',
        whoMade: 'i_did',
        isDigital: false,
        nonTaxable: false,
        tags: [],
        images: [],
        attributes: [],
        variants: [],
        inventory: [],
      } as never,
      [{
        sku: 'SIZE-8',
        inventoryId: 'inventory-eight',
        variantId: 'variant-eight',
        clientRef: 'variant-1',
      }],
    ));

    expect(exception).toBeInstanceOf(ConflictException);
    expect(exception.getResponse()).toMatchObject({
      code: 'ProductSkuConflict',
      affected_ids: ['inventory-eight'],
      conflicts: [{
        sku: 'SIZE-8',
        inventory_id: 'inventory-eight',
        variant_id: 'variant-eight',
        client_ref: 'variant-1',
      }],
    });
  });
});
