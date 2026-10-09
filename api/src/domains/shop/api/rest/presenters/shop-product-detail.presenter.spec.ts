import type { ProductDraftSummary } from '~/domains/product/app/product.types';
import { toShopProductDetailResponse } from './shop-product-detail.presenter';

function buildSummary(inventory: ProductDraftSummary['inventory']): ProductDraftSummary {
  return {
    id: 'product-1',
    publicId: 'PUBLIC1',
    shopId: 'shop-1',
    shopPublicId: 'SHOP1',
    title: 'Product',
    slug: 'product',
    description: '',
    state: 'draft',
    productVersion: 1,
    whoMade: 'i_did',
    isDigital: false,
    nonTaxable: false,
    tags: [],
    images: [],
    attributes: [],
    options: [],
    variants: [],
    inventory,
    shipping: undefined,
  } as unknown as ProductDraftSummary;
}

describe('toShopProductDetailResponse inventory', () => {
  it('exposes the derived quantity contract without internal Stock Pool identity', () => {
    const response = toShopProductDetailResponse(buildSummary([
      {
        id: 'inventory-1',
        productVariantId: '',
        sku: 'SKU-1',
        stock: 4,
        onHandQuantity: 4,
        reservedQuantity: 1,
        availableQuantity: 3,
        onHandVersion: 2,
        shortage: 0,
        lifecycleState: 'active',
      },
    ]));

    expect(response.inventory[0]).toMatchObject({
      id: 'inventory-1',
      stock: 4,
      on_hand_quantity: 4,
      reserved_quantity: 1,
      available_quantity: 3,
      on_hand_version: 2,
      shortage: 0,
    });
    expect(response.inventory[0]).not.toHaveProperty('stock_pool_id');
    expect(response.inventory[0]).not.toHaveProperty('stock_pool_name');
  });
});
