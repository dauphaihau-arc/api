import { ProductImageVariant } from '../../product/domain/enums/product-image-variant.enum';
import { ProductImageVariantEntity } from '../../product/infra/persistence/entities/product-image-variant.entity';
import { ProductImageEntity } from '../../product/infra/persistence/entities/product-image.entity';
import { toShopOrderDetail } from './shop-order-read-model';
import type { OrderEntity } from '../infra/persistence/entities/order.entity';
import type { OrderItemEntity } from '../infra/persistence/entities/order-item.entity';

describe('shop-order-read-model', () => {
  it('prefers the thumb_1x1 storage key for shop order detail products', () => {
    const thumbVariant = new ProductImageVariantEntity();
    thumbVariant.variant = ProductImageVariant.THUMB_1X1;
    thumbVariant.storageKey = 'dev/public/shops/shop-1/products/product-1/images/main/thumb_1x1.webp';

    const image = {
      rank: 1,
      storageKey: 'dev/public/shops/shop-1/products/product-1/images/main/original.webp',
      variants: {
        getItems: () => [thumbVariant],
      },
    } as unknown as ProductImageEntity;

    const order = {
      id: 'order-1',
      orderNumber: 'ORD-1',
      currency: 'HKD',
      customerEmail: 'seller@example.com',
      paymentType: 'card',
      status: 'paid',
      promoCodes: [],
      shippingStatus: 'pre_transit',
      updatedAt: new Date('2026-06-04T13:00:00.000Z'),
      shippingToCountry: 'HK',
      shippingOriginCountries: ['HK'],
      shippingEstimatedDelivery: new Date('2026-06-10T00:00:00.000Z'),
      subtotal: 0,
      totalShippingFee: 0,
      totalDiscount: 0,
      total: 0,
      createdAt: new Date('2026-06-04T12:00:00.000Z'),
      shippingAddress: {
        full_name: 'Hau Tran',
        address1: '1 Main St',
        city: 'Hong Kong',
        country: 'HK',
        state: 'HK',
        zip: '00000',
      },
      shop: {
        id: 'shop-1',
        shopName: 'Shop',
        slug: 'shop',
      },
    } as unknown as OrderEntity;

    const item = {
      id: 'item-1',
      title: 'Oak Side Table',
      imageUrl: 'http://127.0.0.1:9000/original.png',
      quantity: 1,
      price: 6.73,
      originalAmountMinor: 774,
      variantName: 'Walnut',
      product: {
        id: 'product-1',
        slug: 'oak-side-table',
        shop: {
          slug: 'shop',
        },
        images: {
          getItems: () => [image],
        },
      },
      inventory: {},
      percentCouponPercent: null,
    } as unknown as OrderItemEntity;

    const detail = toShopOrderDetail(order, [item], []);

    expect(detail.products[0]?.imageStorageKey).toBe(thumbVariant.storageKey);
  });

  it('falls back to the original product image storage key when no thumb variant exists', () => {
    const image = {
      rank: 1,
      storageKey: 'dev/public/shops/shop-1/products/product-1/images/main/original.webp',
      variants: {
        getItems: () => [],
      },
    } as unknown as ProductImageEntity;

    const order = {
      id: 'order-1',
      orderNumber: 'ORD-1',
      currency: 'HKD',
      customerEmail: 'seller@example.com',
      paymentType: 'card',
      status: 'paid',
      promoCodes: [],
      shippingStatus: 'pre_transit',
      updatedAt: new Date('2026-06-04T13:00:00.000Z'),
      shippingToCountry: 'HK',
      shippingOriginCountries: ['HK'],
      shippingEstimatedDelivery: new Date('2026-06-10T00:00:00.000Z'),
      subtotal: 0,
      totalShippingFee: 0,
      totalDiscount: 0,
      total: 0,
      createdAt: new Date('2026-06-04T12:00:00.000Z'),
      shippingAddress: {
        full_name: 'Hau Tran',
        address1: '1 Main St',
        city: 'Hong Kong',
        country: 'HK',
        state: 'HK',
        zip: '00000',
      },
      shop: {
        id: 'shop-1',
        shopName: 'Shop',
        slug: 'shop',
      },
    } as unknown as OrderEntity;

    const item = {
      id: 'item-1',
      title: 'Oak Side Table',
      imageUrl: 'http://127.0.0.1:9000/original.png',
      quantity: 1,
      price: 6.73,
      originalAmountMinor: 774,
      variantName: 'Walnut',
      product: {
        id: 'product-1',
        slug: 'oak-side-table',
        shop: {
          slug: 'shop',
        },
        images: {
          getItems: () => [image],
        },
      },
      inventory: {},
      percentCouponPercent: null,
    } as unknown as OrderItemEntity;

    const detail = toShopOrderDetail(order, [item], []);

    expect(detail.products[0]?.imageStorageKey).toBe(image.storageKey);
  });
});
