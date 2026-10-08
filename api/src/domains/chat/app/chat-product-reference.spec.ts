import type { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { buildChatProductReferenceMetadata } from './chat-product-reference';

describe('buildChatProductReferenceMetadata', () => {
  it('uses the product public id in nested message metadata', () => {
    const product = {
      id: 'product-internal-1',
      publicId: 'prod_1',
      title: 'Clay Mug',
      slug: 'clay-mug',
      state: 'active',
      shop: { slug: 'clay-house' },
      images: { getItems: () => [] },
      inventoryRecords: { getItems: () => [] },
    } as unknown as ProductEntity;

    expect(buildChatProductReferenceMetadata(product, () => undefined)).toEqual({
      product_reference: {
        product_id: 'prod_1',
        snapshot: {
          title: 'Clay Mug',
          shop_slug: 'clay-house',
          product_slug: 'clay-mug',
        },
        current: {
          status: 'active',
          in_stock: false,
          stock: 0,
        },
      },
    });
  });
});
