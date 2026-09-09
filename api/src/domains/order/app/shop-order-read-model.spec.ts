import { toShopOrderDetail } from './shop-order-read-model';
import type { OrderEntity } from '../infra/persistence/entities/order.entity';
import type { OrderItemEntity } from '../infra/persistence/entities/order-item.entity';

describe('shop-order-read-model', () => {
  it('uses order item snapshot facts instead of mutable current catalog fields', () => {
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
        full_name: 'Buyer',
        address1: '1 Main',
        city: 'Hong Kong',
        country: 'HK',
        state: '',
        zip: '',
        phone: '1234',
      },
      shop: { id: 'shop-1', shopName: 'Shop', slug: 'shop' },
    } as unknown as OrderEntity;

    const item = {
      id: 'item-1',
      title: 'Purchased Title',
      imageUrl: 'https://cdn.example.com/order-card.webp',
      imageReference: 'retained/order-safe/card.webp',
      sku: 'SKU-PURCHASED',
      quantity: 1,
      price: 6.73,
      unitPriceMinor: 673,
      originalAmountMinor: 774,
      lineTotalMinor: 673,
      currency: 'HKD',
      product: {
        id: 'product-1',
        slug: 'current-slug',
        shop: { slug: 'shop' },
        images: {
          getItems: () => [{
            storageKey: 'mutable/current/original.webp',
            rank: 1,
            variants: {
              getItems: () => [{
                variant: 'thumb_1x1',
                storageKey: 'mutable/current/thumb.webp',
              }],
            },
          }],
        },
      },
      percentCouponPercent: null,
    } as unknown as OrderItemEntity;

    const detail = toShopOrderDetail(order, [item], []);

    expect(detail.products[0]).toEqual(
      expect.objectContaining({
        title: 'Purchased Title',
        imageUrl: 'https://cdn.example.com/order-card.webp',
        imageReference: 'retained/order-safe/card.webp',
        imageStorageKey: 'retained/order-safe/card.webp',
        sku: 'SKU-PURCHASED',
        amountMinor: 673,
        originalAmountMinor: 774,
        currency: 'HKD',
      }),
    );
  });
});
