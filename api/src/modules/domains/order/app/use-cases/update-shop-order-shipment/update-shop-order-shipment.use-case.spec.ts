import type { EntityManager } from '@mikro-orm/postgresql';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { ShipmentUpdateNotAllowedError } from '../../errors/order-app.error';
import { UpdateShopOrderShipmentUseCase } from './update-shop-order-shipment.use-case';

describe('UpdateShopOrderShipmentUseCase', () => {
  function buildUseCase(input?: {
    orderStatus?: OrderStatus;
    shippingStatus?: OrderShippingStatus;
  }) {
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
      status: input?.orderStatus ?? OrderStatus.PAID,
      shippingStatus: input?.shippingStatus ?? OrderShippingStatus.PRE_TRANSIT,
      promoCodes: [],
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

    return {
      order,
      fakeEntityManager,
      useCase: new UpdateShopOrderShipmentUseCase(entityManager),
    };
  }

  it('updates shipment details and marks the order as shipped', async () => {
    const { useCase, order, fakeEntityManager } = buildUseCase();

    const result = await useCase.execute('shop-1', 'order-1', {
      shippingStatus: OrderShippingStatus.SHIPPED,
      trackingNumber: '1Z999',
      shippingCarrier: 'UPS',
      shipmentNote: 'Left warehouse',
    });

    expect(order.shippingStatus).toBe(OrderShippingStatus.SHIPPED);
    expect(order.trackingNumber).toBe('1Z999');
    expect(order.shippingCarrier).toBe('UPS');
    expect(order.shipmentNote).toBe('Left warehouse');
    expect(order.shippedAt).toBeInstanceOf(Date);
    expect(fakeEntityManager.flush).toHaveBeenCalled();
    expect(result.shippingStatus).toBe(OrderShippingStatus.SHIPPED);
  });

  it('marks a paid order as completed when delivered', async () => {
    const { useCase, order } = buildUseCase({
      shippingStatus: OrderShippingStatus.SHIPPED,
    });

    const result = await useCase.execute('shop-1', 'order-1', {
      shippingStatus: OrderShippingStatus.DELIVERED,
    });

    expect(order.shippingStatus).toBe(OrderShippingStatus.DELIVERED);
    expect(order.deliveredAt).toBeInstanceOf(Date);
    expect(order.status).toBe(OrderStatus.COMPLETED);
    expect(result.status).toBe(OrderStatus.COMPLETED);
  });

  it('rejects shipment updates while payment is still pending', async () => {
    const { useCase } = buildUseCase({
      orderStatus: OrderStatus.AWAITING_PAYMENT,
    });

    await expect(
      useCase.execute('shop-1', 'order-1', {
        shippingStatus: OrderShippingStatus.SHIPPED,
      })
    ).rejects.toThrow(ShipmentUpdateNotAllowedError);
  });
});
