import type { EntityManager } from '@mikro-orm/postgresql';
import type { CouponPricingService } from '../../coupon/app/coupon-pricing.service';
import { CartKind } from '../../cart/domain/enums/cart-kind.enum';
import type { OrderCheckoutOutboxService } from './order-checkout-outbox.service';
import { OrderCheckoutService } from './order-checkout.service';
import type { CartSnapshot } from '../../cart/app/cart.types';
import type { PricedCartSummary } from './order.types';
import { PaymentType } from '../domain/enums/payment-type.enum';
import { OrderStatus } from '../domain/enums/order-status.enum';

describe('OrderCheckoutService', () => {
  const cart: CartSnapshot = {
    id: 'cart-1',
    userId: 'user-1',
    guestSessionId: null,
    kind: CartKind.ACTIVE,
    items: [],
  };

  const pricedCart: PricedCartSummary = {
    cart,
    shops: [
      {
        shopId: 'shop-1',
        shopName: 'Shop 1',
        items: [
          {
            cartItemId: 'cart-item-1',
            inventoryId: 'inventory-1',
            productId: 'product-1',
            shopId: 'shop-1',
            shopName: 'Shop 1',
            shopSlug: 'shop-1',
            title: 'Product 1',
            imageUrl: 'https://example.com/product-1.png',
            quantity: 2,
            variantName: 'Blue',
            variantGroupName: 'Color',
            variantSubGroupName: 'Primary',
            price: 10,
            salePrice: 9,
            baseUnitPrice: 10,
            effectiveUnitPrice: 9,
          },
        ],
        subtotal: 18,
        totalDiscount: 2,
        totalShippingFee: 0,
        total: 18,
        note: 'Leave at door',
        promoCoupons: [],
        originCountries: ['US'],
      },
    ],
    subtotalPrice: 18,
    totalDiscount: 2,
    subtotalAfterDiscount: 16,
    totalShippingFee: 0,
    totalPrice: 18,
    totalSelectedQuantity: 2,
    totalQuantity: 2,
  };

  function buildService(options?: {
    processResult?: string | undefined;
  }) {
    const orders: Array<Record<string, unknown>> = [];
    const inventory = {
      id: 'inventory-1',
      stock: 5,
    };
    const shop = {
      id: 'shop-1',
      shopName: 'Shop 1',
      slug: 'shop-1',
    };

    const orderRepository = {
      create: jest.fn((input: Record<string, unknown>) => {
        const order = {
          id: `order-${orders.length + 1}`,
          ...input,
        };
        orders.push(order);
        return order;
      }),
    };
    const orderItemRepository = {
      create: jest.fn((input: Record<string, unknown>) => input),
    };
    const usageRepository = {
      create: jest.fn((input: Record<string, unknown>) => input),
    };

    const fakeEntityManager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        switch (entity?.name) {
          case 'ProductInventoryEntity':
            return {
              findOne: jest.fn().mockResolvedValue(inventory),
            };
          case 'OrderEntity':
            return orderRepository;
          case 'OrderItemEntity':
            return orderItemRepository;
          case 'CouponUsageEntity':
            return usageRepository;
          case 'ShopEntity':
            return {
              findOne: jest.fn().mockResolvedValue(shop),
            };
          default:
            return {
              findOne: jest.fn(),
            };
        }
      }),
      getReference: jest.fn((_entity: unknown, id: string) => ({ id })),
      getConnection: jest.fn(() => ({
        execute: jest.fn().mockResolvedValue(undefined),
      })),
      persist: jest.fn(),
      flush: jest.fn().mockResolvedValue(undefined),
    };

    const entityManager = {
      transactional: jest.fn(async (callback: (em: EntityManager) => Promise<unknown>) =>
        callback(fakeEntityManager as unknown as EntityManager)),
    } as unknown as EntityManager;

    const couponPricingService: jest.Mocked<CouponPricingService> = {
      priceCart: jest.fn().mockResolvedValue(pricedCart),
    } as unknown as jest.Mocked<CouponPricingService>;

    const orderCheckoutOutboxService: jest.Mocked<OrderCheckoutOutboxService> = {
      createCheckoutSessionRequestedEvent: jest.fn().mockResolvedValue({
        id: 'outbox-1',
      } as never),
      processEventById: jest.fn().mockResolvedValue(options?.processResult),
      processPendingEvents: jest.fn(),
    } as unknown as jest.Mocked<OrderCheckoutOutboxService>;

    const service = new OrderCheckoutService(
      entityManager,
      couponPricingService,
      orderCheckoutOutboxService
    );

    return {
      service,
      fakeEntityManager,
      orderRepository,
      orderCheckoutOutboxService,
    };
  }

  it('writes a checkout outbox event for card payments and returns a checkout URL when immediate processing succeeds', async () => {
    const {
      service,
      orderRepository,
      orderCheckoutOutboxService,
    } = buildService({
      processResult: 'https://stripe.test/session-1',
    });

    const result = await service.createOrders(
      'user-1',
      'member@example.com',
      'cart-1',
      cart,
      {
        paymentType: PaymentType.CARD,
        shippingAddress: {
          fullName: 'Member User',
          address1: '123 Main St',
          city: 'Los Angeles',
          country: 'US',
          state: 'CA',
          zip: '90001',
          phone: '123456789',
        },
        isTempCart: false,
      }
    );

    expect(orderRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: OrderStatus.CHECKOUT_PENDING,
      })
    );
    expect(
      orderCheckoutOutboxService.createCheckoutSessionRequestedEvent
    ).toHaveBeenCalled();
    expect(orderCheckoutOutboxService.processEventById).toHaveBeenCalledWith('outbox-1');
    expect(result.checkoutSessionUrl).toBe('https://stripe.test/session-1');
    expect(result.checkoutPending).toBe(false);
  });

  it('returns checkout pending when immediate outbox processing does not produce a checkout URL', async () => {
    const { service } = buildService();

    const result = await service.createOrders(
      'user-1',
      'member@example.com',
      'cart-1',
      cart,
      {
        paymentType: PaymentType.CARD,
        shippingAddress: {
          fullName: 'Member User',
          address1: '123 Main St',
          city: 'Los Angeles',
          country: 'US',
          state: 'CA',
          zip: '90001',
          phone: '123456789',
        },
        isTempCart: false,
      }
    );

    expect(result.checkoutSessionUrl).toBeUndefined();
    expect(result.checkoutPending).toBe(true);
  });

  it('does not create an outbox event for cash payments', async () => {
    const {
      service,
      orderRepository,
      orderCheckoutOutboxService,
    } = buildService();

    const result = await service.createOrders(
      'user-1',
      'member@example.com',
      'cart-1',
      cart,
      {
        paymentType: PaymentType.CASH,
        shippingAddress: {
          fullName: 'Member User',
          address1: '123 Main St',
          city: 'Los Angeles',
          country: 'US',
          state: 'CA',
          zip: '90001',
          phone: '123456789',
        },
        isTempCart: false,
      }
    );

    expect(orderRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: OrderStatus.PENDING,
      })
    );
    expect(
      orderCheckoutOutboxService.createCheckoutSessionRequestedEvent
    ).not.toHaveBeenCalled();
    expect(orderCheckoutOutboxService.processEventById).not.toHaveBeenCalled();
    expect(result.checkoutPending).toBe(false);
  });
});
