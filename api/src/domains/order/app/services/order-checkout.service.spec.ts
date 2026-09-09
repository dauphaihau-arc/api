import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { CouponPricingService } from '../../../coupon/app/services/coupon-pricing.service';
import type { NotifyUserUseCase } from '../../../../domains/notification/app/use-cases/notify-user/notify-user.use-case';
import { CartKind } from '../../../cart/domain/enums/cart-kind.enum';
import type { OrderCheckoutOutboxService } from './order-checkout-outbox.service';
import type { CheckoutStockReservationPort } from '../../../checkout/app/ports/checkout-stock-reservation.port';
import type { OrderInventoryOutboxService } from './order-inventory-outbox.service';
import { OrderCheckoutService } from './order-checkout.service';
import type { CartSnapshot } from '../../../cart/app/cart.types';
import type { PricedCartSummary } from '../order.types';
import { PaymentType } from '../../domain/enums/payment-type.enum';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import type { OrderTotalPolicyService } from './order-total-policy.service';
import type { OrderCartCleanupRepository } from '../ports/order-cart-cleanup.repository';
import type { OrderInventoryQueryRepository } from '../ports/order-inventory-query.repository';
import type { OrderShopQueryRepository } from '../ports/order-shop-query.repository';
import type { PurchaseEligibilityService } from '../../../product/app/services/purchase-eligibility.service';
import { OrderTotalLimitExceededError } from '../errors/order-app.error';

function waitForDeferredCheckoutSideEffects(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

// This spec keeps the checkout matrix in one place because the setup is shared across scenarios.
// eslint-disable-next-line max-lines-per-function
describe('OrderCheckoutService', () => {
  const cart: CartSnapshot = {
    id: 'cart-1',
    userId: 'user-1',
    guestSessionId: null,
    kind: CartKind.ACTIVE,
    items: [],
  };

  const pricedCartSummary: PricedCartSummary = {
    cart,
    currency: 'USD',
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
            currency: 'USD',
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
  const shippingAddress = {
    fullName: 'Member User',
    address1: '123 Main St',
    city: 'Los Angeles',
    country: 'US',
    state: 'CA',
    zip: '90001',
    phone: '123456789',
  };

  function buildService(options?: {
    processResult?: { id: string; url: string } | undefined;
    purchaseEligibilityResult?: { eligible: boolean; failures: Array<Record<string, unknown>> };
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
      ownerUser: {
        id: 'seller-1',
      },
    };

    const orderRepository = {
      create: jest.fn((input: Record<string, unknown>) => {
        const order = {
          id: `order-${orders.length + 1}`,
          orderNumber: `ORD-20260604-00000${orders.length + 1}`,
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
              find: jest.fn().mockResolvedValue([inventory]),
            };
          case 'OrderEntity':
            return orderRepository;
          case 'OrderItemEntity':
            return orderItemRepository;
          case 'CouponUsageEntity':
            return usageRepository;
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
      buildPricedCartSummary: jest.fn().mockResolvedValue(pricedCartSummary),
    } as unknown as jest.Mocked<CouponPricingService>;

    const orderCheckoutOutboxService: jest.Mocked<OrderCheckoutOutboxService> = {
      createCheckoutSessionRequestedEvent: jest.fn().mockResolvedValue({
        id: 'outbox-1',
      } as never),
      processEventById: jest.fn().mockResolvedValue(options?.processResult),
      processPendingEvents: jest.fn(),
    } as unknown as jest.Mocked<OrderCheckoutOutboxService>;
    const orderInventoryOutboxService: jest.Mocked<OrderInventoryOutboxService> = {
      createOrderCreatedEvent: jest.fn().mockResolvedValue({
        id: 'inventory-outbox-1',
      } as never),
    } as unknown as jest.Mocked<OrderInventoryOutboxService>;
    const checkoutStockReservationService = {
      consumeReservationsForQuote: jest.fn().mockResolvedValue(undefined),
      allocateInventoryForOrderItems: jest.fn().mockResolvedValue({
        inventoryById: new Map([[
          'inventory-1',
          {
            id: 'inventory-1',
            stock: 3,
          },
        ]]),
        inventoryEvents: [
          {
            productId: 'product-1',
            inventoryId: 'inventory-1',
            stock: 3,
          },
        ],
      }),
    } as unknown as jest.Mocked<CheckoutStockReservationPort>;

    const eventEmitter: Pick<jest.Mocked<EventEmitter2>, 'emit'> = {
      emit: jest.fn(),
    };
    const jobDispatcher = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };
    const orderTotalPolicyService: Pick<
      jest.Mocked<OrderTotalPolicyService>,
      'assertWithinLimit'
    > = {
      assertWithinLimit: jest.fn(),
    };
    const notifyUserUseCase = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotifyUserUseCase>;
    const orderEventsService = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    const orderCartCleanupRepository = {
      clearCheckoutCart: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<OrderCartCleanupRepository>;
    const orderInventoryQueryRepository = {
      findByIds: jest.fn().mockResolvedValue(new Map([['inventory-1', inventory]])),
    } as unknown as jest.Mocked<OrderInventoryQueryRepository>;
    const orderShopQueryRepository = {
      findByIdWithOwner: jest.fn().mockResolvedValue(shop),
    } as unknown as jest.Mocked<OrderShopQueryRepository>;
    const purchaseEligibilityService = {
      evaluate: jest.fn().mockResolvedValue(
        options?.purchaseEligibilityResult ?? { eligible: true, failures: [] },
      ),
    } as unknown as jest.Mocked<PurchaseEligibilityService>;

    const service = new OrderCheckoutService(
      entityManager,
      couponPricingService,
      checkoutStockReservationService,
      orderCheckoutOutboxService,
      orderInventoryOutboxService,
      orderEventsService as never,
      notifyUserUseCase,
      eventEmitter as unknown as EventEmitter2,
      jobDispatcher as never,
      orderTotalPolicyService as unknown as OrderTotalPolicyService,
      orderCartCleanupRepository,
      orderInventoryQueryRepository,
      orderShopQueryRepository,
      purchaseEligibilityService,
    );

    return {
      service,
      eventEmitter,
      jobDispatcher,
      notifyUserUseCase,
      orderTotalPolicyService,
      fakeEntityManager,
      orderRepository,
      orderItemRepository,
      orderCheckoutOutboxService,
      orderInventoryOutboxService,
      checkoutStockReservationService,
      orderCartCleanupRepository,
      orderInventoryQueryRepository,
      orderShopQueryRepository,
      purchaseEligibilityService,
    };
  }

  it('writes a checkout outbox event and returns the inline checkout session when ready', async () => {
    const {
      service,
      eventEmitter,
      notifyUserUseCase,
      orderTotalPolicyService,
      orderRepository,
      orderItemRepository,
      orderCheckoutOutboxService,
      orderInventoryOutboxService,
      checkoutStockReservationService,
    } = buildService({
      processResult: {
        id: 'cs_test_1',
        url: 'https://stripe.test/session-1',
      },
    });

    const result = await service.createOrders(
      {
        type: 'user',
        userId: 'user-1',
        email: 'member@example.com',
      },
      'cart-1',
      cart,
      {
        paymentType: PaymentType.CARD,
        shippingAddress,
        isTempCart: false,
      },
    );

    expect(orderRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customerEmail: 'member@example.com',
        status: OrderStatus.CHECKOUT_PENDING,
        subtotalMinor: 1800,
        shippingMinor: 0,
        discountMinor: 200,
        totalMinor: 1800,
      }),
    );
    expect(orderTotalPolicyService.assertWithinLimit).toHaveBeenCalledWith({
      totalMinor: 1800,
      currency: 'USD',
    });
    expect(orderItemRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        unitPriceMinor: 900,
        originalAmountMinor: 1000,
        lineTotalMinor: 1800,
      }),
    );
    expect(checkoutStockReservationService.allocateInventoryForOrderItems).toHaveBeenCalledWith(
      expect.anything(),
      [{
        inventoryId: 'inventory-1',
        productId: 'product-1',
        quantity: 2,
        title: 'Product 1',
      }],
    );
    expect(
      orderCheckoutOutboxService.createCheckoutSessionRequestedEvent,
    ).toHaveBeenCalled();
    expect(orderInventoryOutboxService.createOrderCreatedEvent).not.toHaveBeenCalled();
    expect(checkoutStockReservationService.consumeReservationsForQuote).not.toHaveBeenCalled();
    expect(orderCheckoutOutboxService.processEventById).toHaveBeenCalledWith('outbox-1');

    await waitForDeferredCheckoutSideEffects();

    expect(eventEmitter.emit).toHaveBeenCalled();
    expect(notifyUserUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'seller-1',
      type: 'seller.order.created',
      body: 'Order ORD-20260604-000001 has been placed.',
      data: expect.objectContaining({
        target: 'seller_order_detail',
        orderId: 'order-1',
        orderNumber: 'ORD-20260604-000001',
        shopId: 'shop-1',
      }),
    }));
    expect(result.checkoutSessionUrl).toBe('https://stripe.test/session-1');
    expect(result.checkoutSessionId).toBe('cs_test_1');
    expect(result.checkoutPending).toBe(false);
  });

  it('returns checkout pending while checkout session is prepared by the worker', async () => {
    const { service, orderTotalPolicyService, orderCheckoutOutboxService } = buildService();

    const result = await service.createOrders(
      {
        type: 'user',
        userId: 'user-1',
        email: 'member@example.com',
      },
      'cart-1',
      cart,
      {
        paymentType: PaymentType.CARD,
        shippingAddress,
        isTempCart: false,
      },
    );

    expect(orderTotalPolicyService.assertWithinLimit).toHaveBeenCalledWith({
      totalMinor: 1800,
      currency: 'USD',
    });
    expect(orderCheckoutOutboxService.processEventById).toHaveBeenCalledWith('outbox-1');
    expect(result.checkoutSessionUrl).toBeUndefined();
    expect(result.checkoutPending).toBe(true);
  });

  it('does not create an outbox event for cash payments', async () => {
    const {
      service,
      orderRepository,
      orderCheckoutOutboxService,
      orderInventoryOutboxService,
    } = buildService();

    const result = await service.createOrders(
      {
        type: 'user',
        userId: 'user-1',
        email: 'member@example.com',
      },
      'cart-1',
      cart,
      {
        paymentType: PaymentType.CASH,
        shippingAddress,
        isTempCart: false,
      },
    );

    expect(orderRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: OrderStatus.PENDING,
      }),
    );
    expect(
      orderCheckoutOutboxService.createCheckoutSessionRequestedEvent,
    ).not.toHaveBeenCalled();
    expect(orderInventoryOutboxService.createOrderCreatedEvent).not.toHaveBeenCalled();
    expect(orderCheckoutOutboxService.processEventById).not.toHaveBeenCalled();
    expect(result.checkoutPending).toBe(false);
  });

  it('creates guest cash orders without a user reference and records the customer email', async () => {
    const {
      service,
      orderRepository,
    } = buildService();

    await service.createOrders(
      {
        type: 'guest',
        email: 'guest@example.com',
      },
      'cart-1',
      {
        ...cart,
        userId: null,
        guestSessionId: 'guest-session-1',
      },
      {
        paymentType: PaymentType.CASH,
        shippingAddress: {
          fullName: 'Guest User',
          address1: '123 Main St',
          city: 'Los Angeles',
          country: 'US',
          state: 'CA',
          zip: '90001',
          phone: '123456789',
        },
        isTempCart: false,
      },
    );

    expect(orderRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customerEmail: 'guest@example.com',
      }),
    );
  });

  it('keeps quoted card inventory reserved until payment completes', async () => {
    const {
      service,
      checkoutStockReservationService,
      orderTotalPolicyService,
      orderRepository,
      orderItemRepository,
      orderInventoryOutboxService,
    } = buildService();

    await service.createOrders(
      {
        type: 'user',
        userId: 'user-1',
        email: 'member@example.com',
      },
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
        quote: {
          id: 'quote-1',
          cartId: 'cart-1',
          reservationId: 'reservation-remote-1',
          marketCode: 'US',
          presentmentCurrency: 'USD',
          checkoutCurrency: 'USD',
          subtotalMinor: 1800,
          shippingMinor: 0,
          discountMinor: 0,
          totalMinor: 1800,
          shippingAddress,
          shops: [
            {
              shopId: 'shop-1',
              shopName: 'Shop 1',
              shopSlug: 'shop-1',
              subtotalMinor: 1800,
              shippingMinor: 0,
              discountMinor: 0,
              totalMinor: 1800,
              promoCodes: [],
              originCountries: ['US'],
              items: [
                {
                  inventoryId: 'inventory-1',
                  productId: 'product-1',
                  shopId: 'shop-1',
                  shopName: 'Shop 1',
                  shopSlug: 'shop-1',
                  title: 'Product 1',
                  imageUrl: 'https://example.com/product-1.png',
                  imageReference: 'dev/public/products/product-1/card.webp',
                  quantity: 2,
                  sku: 'SKU-BLUE',
                  sourceCurrency: 'USD',
                  unitPriceSourceMinor: 1000,
                  lineTotalSourceMinor: 2000,
                  checkoutCurrency: 'USD',
                  unitPriceCheckoutMinor: 900,
                  lineTotalCheckoutMinor: 1800,
                  unitPriceMinor: 900,
                  originalAmountMinor: 1000,
                  lineTotalMinor: 1800,
                  currency: 'USD',
                  sourcePriceId: 'price-1',
                  sourceType: 'base_fx',
                  marketCode: 'US',
                  fxRate: '1.10',
                  fxSource: 'seed',
                  fxEffectiveAt: new Date('2026-05-20T00:00:00.000Z'),
                  fxSourceTimestamp: new Date('2026-05-20T00:00:00.000Z'),
                },
              ],
            },
          ],
          items: [
            {
              inventoryId: 'inventory-1',
              productId: 'product-1',
              shopId: 'shop-1',
              shopName: 'Shop 1',
              shopSlug: 'shop-1',
              title: 'Product 1',
              imageUrl: 'https://example.com/product-1.png',
              imageReference: 'dev/public/products/product-1/card.webp',
              quantity: 2,
              sku: 'SKU-BLUE',
              sourceCurrency: 'USD',
              unitPriceSourceMinor: 1000,
              lineTotalSourceMinor: 2000,
              checkoutCurrency: 'USD',
              unitPriceCheckoutMinor: 900,
              lineTotalCheckoutMinor: 1800,
              unitPriceMinor: 900,
              originalAmountMinor: 1000,
              lineTotalMinor: 1800,
              currency: 'USD',
              sourcePriceId: 'price-1',
              sourceType: 'base_fx',
              marketCode: 'US',
              fxRate: '1.10',
              fxSource: 'seed',
              fxEffectiveAt: new Date('2026-05-20T00:00:00.000Z'),
              fxSourceTimestamp: new Date('2026-05-20T00:00:00.000Z'),
            },
          ],
        },
        isTempCart: false,
      },
    );

    expect(orderRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        marketCode: 'US',
        subtotalMinor: 1800,
        shippingMinor: 0,
        discountMinor: 0,
        totalMinor: 1800,
      }),
    );
    expect(orderTotalPolicyService.assertWithinLimit).toHaveBeenCalledWith({
      totalMinor: 1800,
      currency: 'USD',
    });
    expect(checkoutStockReservationService.consumeReservationsForQuote).not.toHaveBeenCalled();
    expect(checkoutStockReservationService.allocateInventoryForOrderItems).not.toHaveBeenCalled();
    expect(orderItemRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Product 1',
        imageUrl: 'https://example.com/product-1.png',
        imageReference: 'dev/public/products/product-1/card.webp',
        sku: 'SKU-BLUE',
        unitPriceMinor: 900,
        originalAmountMinor: 1000,
        lineTotalMinor: 1800,
        currency: 'USD',
        sourcePriceId: 'price-1',
        sourceType: 'base_fx',
        marketCode: 'US',
        fxRate: '1.10',
        fxSource: 'seed',
      }),
    );
    expect(orderInventoryOutboxService.createOrderCreatedEvent).not.toHaveBeenCalled();
  });

  it('rechecks purchase eligibility before final order creation', async () => {
    const {
      service,
      checkoutStockReservationService,
      orderRepository,
      purchaseEligibilityService,
    } = buildService({
      purchaseEligibilityResult: {
        eligible: false,
        failures: [{
          inventoryId: 'inventory-1',
          quantity: 2,
          title: 'Product 1',
          reason: 'variant_inactive',
        }],
      },
    });

    await expect(
      service.createOrders(
        {
          type: 'user',
          userId: 'user-1',
          email: 'member@example.com',
        },
        'cart-1',
        cart,
        {
          paymentType: PaymentType.CARD,
          shippingAddress,
          isTempCart: false,
        },
      ),
    ).rejects.toThrow('reservation is no longer available');

    expect(purchaseEligibilityService.evaluate).toHaveBeenCalledWith(
      {
        items: [{
          inventoryId: 'inventory-1',
          productId: 'product-1',
          quantity: 2,
          title: 'Product 1',
        }],
        requireAvailableQuantity: true,
      },
      expect.anything(),
    );
    expect(checkoutStockReservationService.allocateInventoryForOrderItems).not.toHaveBeenCalled();
    expect(checkoutStockReservationService.consumeReservationsForQuote).not.toHaveBeenCalled();
    expect(orderRepository.create).not.toHaveBeenCalled();
  });

  it('rejects orders above the configured order-total limit before persistence', async () => {
    const {
      service,
      orderRepository,
      orderTotalPolicyService,
    } = buildService();
    orderTotalPolicyService.assertWithinLimit.mockImplementation(() => {
      throw new OrderTotalLimitExceededError('USD');
    });

    await expect(
      service.createOrders(
        {
          type: 'user',
          userId: 'user-1',
          email: 'member@example.com',
        },
        'cart-1',
        cart,
        {
          paymentType: PaymentType.CARD,
          shippingAddress,
          isTempCart: false,
        },
      ),
    ).rejects.toThrow(OrderTotalLimitExceededError);

    expect(orderRepository.create).not.toHaveBeenCalled();
  });
});
