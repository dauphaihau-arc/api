import type { EntityManager } from '@mikro-orm/postgresql';
import { UpdateAdminOrderSupportNoteUseCase } from './update-admin-order-support-note.use-case';

describe('UpdateAdminOrderSupportNoteUseCase', () => {
  it('stores a trimmed support note', async () => {
    const order = {
      id: 'order-1',
      shop: {
        id: 'shop-1',
        shopName: 'Shop 1',
        slug: 'shop-1',
      },
      customerEmail: 'buyer@example.com',
      shippingAddress: {
        full_name: 'Buyer One',
        address1: '123 Main St',
        city: 'Los Angeles',
        country: 'US',
        state: 'CA',
        zip: '90001',
      },
      paymentType: 'card',
      status: 'paid',
      promoCodes: [],
      shippingStatus: 'pre_transit',
      shippingOriginCountries: ['US'],
      shippingToCountry: 'US',
      shippingEstimatedDelivery: new Date('2026-05-30T00:00:00.000Z'),
      subtotal: 25,
      totalShippingFee: 5,
      totalDiscount: 0,
      total: 30,
      note: undefined,
      trackingNumber: undefined,
      shippingCarrier: undefined,
      shipmentNote: undefined,
      shippedAt: undefined,
      deliveredAt: undefined,
      canceledAt: undefined,
      cancelReason: undefined,
      refundedAt: undefined,
      supportNote: undefined,
      paymentDetails: undefined,
      createdAt: new Date('2026-05-23T00:00:00.000Z'),
      updatedAt: new Date('2026-05-23T00:00:00.000Z'),
    };
    const item = {
      id: 'item-1',
      order: { id: 'order-1' },
      product: {
        id: 'product-1',
        slug: 'product-1',
        shop: { slug: 'shop-1' },
      },
      inventory: {},
      title: 'Product 1',
      imageUrl: 'https://example.com/product-1.png',
      quantity: 1,
      price: 25,
      salePrice: undefined,
      variantName: 'Blue',
      variantGroupName: 'Color',
      variantSubGroupName: undefined,
      percentCouponPercent: null,
    };
    const fakeEntityManager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        switch (entity?.name) {
          case 'OrderEntity':
            return {
              findOne: jest.fn().mockResolvedValue(order),
            };
          case 'OrderItemEntity':
            return {
              find: jest.fn().mockResolvedValue([item]),
            };
          default:
            return {};
        }
      }),
      flush: jest.fn().mockResolvedValue(undefined),
    } as unknown as EntityManager;

    const entityManager = {
      fork: jest.fn(() => fakeEntityManager),
    } as unknown as EntityManager;

    const useCase = new UpdateAdminOrderSupportNoteUseCase(entityManager);
    const result = await useCase.execute('order-1', {
      supportNote: '  Manual refund requested by support  ',
    });

    expect(order.supportNote).toBe('Manual refund requested by support');
    expect(fakeEntityManager.flush).toHaveBeenCalled();
    expect(result.supportNote).toBe('Manual refund requested by support');
  });
});
