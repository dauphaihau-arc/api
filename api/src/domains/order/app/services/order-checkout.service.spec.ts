import type { EntityManager } from '@mikro-orm/postgresql';
import type { NotifyUserUseCase } from '../../../../domains/notification/app/use-cases/notify-user/notify-user.use-case';
import type { CartPricingService } from '../../../cart/app/services/cart-pricing.service';
import { CartKind } from '../../../cart/domain/enums/cart-kind.enum';
import type { OrderCheckoutOutboxService } from './order-checkout-outbox.service';
import type { CheckoutStockReservationPort } from '../../../checkout/app/ports/checkout-stock-reservation.port';
import type { FulfillmentService } from '../../../fulfillment/app/services/fulfillment.service';
import type { PromotionRedemptionService } from '../../../promotion/app/services/promotion-redemption.service';
import type { OrderInventoryOutboxService } from './order-inventory-outbox.service';
import { OrderCheckoutService } from './order-checkout.service';
import type { CartSnapshot } from '../../../cart/app/cart.types';
import type { PricedCartItem, PricedCartSummary } from '../order.types';
import { PaymentType } from '../../domain/enums/payment-type.enum';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import type { OrderTotalPolicyService } from './order-total-policy.service';
import type { OrderCartCleanupRepository } from '../ports/order-cart-cleanup.repository';
import type { OrderInventoryQueryRepository } from '../ports/order-inventory-query.repository';
import type { OrderShopQueryRepository } from '../ports/order-shop-query.repository';
import type { PurchaseEligibilityService } from '../../../product/app/services/purchase-eligibility.service';
import type { ShippingQuoteService } from '../../../shipping/app/services/shipping-quote.service';
import ms from 'ms';
import type { PaymentConfig } from '../../../../platform/config/payment.config';
import {
  CheckoutShippingUnavailableError,
  OrderNoItemsError,
  OrderTotalLimitExceededError,
} from '../errors/order-app.error';

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
        shopPublicId: 'shop_public1',
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
        saleDiscount: 2,
        totalShippingFee: 0,
        total: 16,
        note: 'Leave at door',
        promoOffers: [],
        originCountries: ['US'],
      },
    ],
    subtotalPrice: 18,
    totalDiscount: 2,
    saleDiscount: 2,
    subtotalAfterDiscount: 16,
    totalShippingFee: 0,
    totalPrice: 16,
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
    shippingResolutions?: Array<Record<string, unknown>>;
    pricedCartSummary?: PricedCartSummary;
    checkoutSessionTtlMs?: number;
  }) {
    const orders: Array<Record<string, unknown>> = [];
    const inventory = {
      id: 'inventory-1',
      stock: 5,
    };
    const shop = {
      id: 'shop-1',
      publicId: 'shop_1',
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
          publicId: `ord_${orders.length + 1}`,
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
          case 'PromotionCodeEntity':
            return { find: jest.fn().mockResolvedValue([]) };
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
    const cartPricingService: jest.Mocked<CartPricingService> = {
      buildPricedCartSummary: jest.fn().mockResolvedValue(options?.pricedCartSummary ?? pricedCartSummary),
    } as unknown as jest.Mocked<CartPricingService>;


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
      reserveForOrder: jest.fn().mockResolvedValue({
        reservationId: 'reservation-1',
      }),
      consumeReservationsForOrder: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CheckoutStockReservationPort>;

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
    const promotionRedemptionService = {
      consumeForOrder: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PromotionRedemptionService>;
    const fulfillmentService = {
      getDispatchState: jest.fn().mockResolvedValue({ hasGroups: true, hasDispatched: false }),
      voidUndispatchedShipments: jest.fn().mockResolvedValue(undefined),
      assignSellerGroupToOrder: jest.fn().mockResolvedValue(undefined),
    } as unknown as FulfillmentService;
    const shippingQuoteService = {
      resolveForProducts: jest.fn(
        async ({ productIds }: { productIds: string[] }) => options?.shippingResolutions ??
          productIds.map((productId) => ({
            productId,
            available: true,
            readinessIssues: [],
          })),
      ),
      quoteForCheckout: jest.fn(),
      listOriginCountries: jest.fn().mockResolvedValue([]),
    } as unknown as ShippingQuoteService;

    const paymentConfig: PaymentConfig = {
      checkoutSessionTtlMs: options?.checkoutSessionTtlMs ?? ms('60m'),
    } as PaymentConfig;

    const service = new OrderCheckoutService(
      entityManager,
      cartPricingService,
      checkoutStockReservationService,
      orderCheckoutOutboxService,
      orderInventoryOutboxService,
      orderEventsService as never,
      notifyUserUseCase,
      jobDispatcher as never,
      orderTotalPolicyService as unknown as OrderTotalPolicyService,
      orderCartCleanupRepository,
      orderInventoryQueryRepository,
      orderShopQueryRepository,
      purchaseEligibilityService,
      promotionRedemptionService,
      fulfillmentService,
      shippingQuoteService,
      paymentConfig,
    );

    return {
      service,
      jobDispatcher,
      notifyUserUseCase,
      orderTotalPolicyService,
      fakeEntityManager,
      orderRepository,
      orderItemRepository,
      orderCheckoutOutboxService,
      shippingQuoteService,
      orderInventoryOutboxService,
      checkoutStockReservationService,
      orderCartCleanupRepository,
      orderInventoryQueryRepository,
      orderShopQueryRepository,
      purchaseEligibilityService,
      promotionRedemptionService,
      fulfillmentService,
    };
  }

  it('holds stock past the payment session expiry so a late payment can still be settled', async () => {
    const {
      service,
      checkoutStockReservationService,
      jobDispatcher,
    } = buildService({ checkoutSessionTtlMs: ms('60m') });
    const now = new Date('2026-06-04T10:00:00.000Z');
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(now.getTime());

    try {
      await service.createOrders(
        {
          type: 'user',
          userId: 'user-1',
          email: 'member@example.com',
        },
        cart,
        {
          paymentType: PaymentType.CARD,
          shippingAddress,
          isTempCart: false,
        },
      );
    }
    finally {
      dateNowSpy.mockRestore();
    }

    // 60m session + the fixed release grace: the reservation must never expire
    // while Stripe can still complete the session, or the paid Order would be
    // left unreservable.
    const expectedHoldMs = ms('60m') + ms('5m');

    expect(checkoutStockReservationService.reserveForOrder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        expiresAt: new Date(now.getTime() + expectedHoldMs),
      }),
    );
    expect(jobDispatcher.dispatch).toHaveBeenCalledWith(
      'order.cleanup-expired-order-reservations',
      { orderId: 'order-1', reservationId: 'reservation-1' },
      expect.objectContaining({ delayMs: expectedHoldMs }),
    );
  });

  it('writes a checkout outbox event and returns the inline checkout session when ready', async () => {
    const {
      service,
      notifyUserUseCase,
      orderTotalPolicyService,
      orderRepository,
      orderItemRepository,
      orderCheckoutOutboxService,
      orderInventoryOutboxService,
      checkoutStockReservationService,
      fulfillmentService,
      jobDispatcher,
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
        totalMinor: 1600,
      }),
    );
    expect(orderTotalPolicyService.assertWithinLimit).toHaveBeenCalledWith({
      totalMinor: 1600,
      currency: 'USD',
    });
    expect(orderItemRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        unitPriceMinor: 900,
        originalAmountMinor: 1000,
        lineTotalMinor: 1800,
        promoDiscountMinor: 0,
      }),
    );
    expect(checkoutStockReservationService.reserveForOrder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orderId: 'order-1',
        cartId: 'cart-1',
        expiresAt: expect.any(Date),
        items: [{
          inventoryId: 'inventory-1',
          quantity: 2,
          title: 'Product 1',
        }],
      }),
    );
    expect(checkoutStockReservationService.consumeReservationsForOrder).not.toHaveBeenCalled();
    expect(
      orderCheckoutOutboxService.createCheckoutSessionRequestedEvent,
    ).toHaveBeenCalled();
    expect(orderInventoryOutboxService.createOrderCreatedEvent).not.toHaveBeenCalled();
    expect(orderCheckoutOutboxService.processEventById).toHaveBeenCalledWith('outbox-1');
    expect(fulfillmentService.assignSellerGroupToOrder).not.toHaveBeenCalled();
    expect(jobDispatcher.dispatch).toHaveBeenCalledWith(
      'order.cleanup-expired-order-reservations',
      { orderId: 'order-1', reservationId: 'reservation-1' },
      expect.objectContaining({ delayMs: expect.any(Number) }),
    );

    await waitForDeferredCheckoutSideEffects();

    expect(notifyUserUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'seller-1',
      type: 'seller.order.created',
      body: 'Order ORD-20260604-000001 has been placed.',
      data: expect.objectContaining({
        target: 'seller_order_detail',
        orderId: 'ord_1',
        orderNumber: 'ORD-20260604-000001',
        shopId: 'shop_1',
      }),
    }));
    expect(result.checkoutSessionUrl).toBe('https://stripe.test/session-1');
    expect(result.checkoutSessionId).toBe('cs_test_1');
    expect(result.checkoutPending).toBe(false);
  });

  it('returns checkout pending while checkout session is prepared by the worker', async () => {
    const {
      service,
      orderTotalPolicyService,
      orderCheckoutOutboxService,
      checkoutStockReservationService,
      orderInventoryOutboxService,
      jobDispatcher,
    } = buildService();

    const result = await service.createOrders(
      {
        type: 'user',
        userId: 'user-1',
        email: 'member@example.com',
      },
      cart,
      {
        paymentType: PaymentType.CARD,
        shippingAddress,
        isTempCart: false,
      },
    );

    expect(orderTotalPolicyService.assertWithinLimit).toHaveBeenCalledWith({
      totalMinor: 1600,
      currency: 'USD',
    });
    expect(checkoutStockReservationService.reserveForOrder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orderId: 'order-1',
        cartId: 'cart-1',
        expiresAt: expect.any(Date),
        items: [{
          inventoryId: 'inventory-1',
          quantity: 2,
          title: 'Product 1',
        }],
      }),
    );
    expect(checkoutStockReservationService.consumeReservationsForOrder).not.toHaveBeenCalled();
    expect(orderInventoryOutboxService.createOrderCreatedEvent).not.toHaveBeenCalled();
    expect(jobDispatcher.dispatch).toHaveBeenCalledWith(
      'order.cleanup-expired-order-reservations',
      { orderId: 'order-1', reservationId: 'reservation-1' },
      expect.objectContaining({ delayMs: expect.any(Number) }),
    );
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
      checkoutStockReservationService,
      fulfillmentService,
    } = buildService();

    const result = await service.createOrders(
      {
        type: 'user',
        userId: 'user-1',
        email: 'member@example.com',
      },
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
    expect(checkoutStockReservationService.reserveForOrder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orderId: 'order-1',
        cartId: 'cart-1',
        expiresAt: expect.any(Date),
        items: [{
          inventoryId: 'inventory-1',
          quantity: 2,
          title: 'Product 1',
        }],
      }),
    );
    expect(checkoutStockReservationService.consumeReservationsForOrder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orderId: 'order-1',
        reservationId: 'reservation-1',
        items: [{
          inventoryId: 'inventory-1',
          quantity: 2,
        }],
      }),
    );
    expect(
      orderCheckoutOutboxService.createCheckoutSessionRequestedEvent,
    ).not.toHaveBeenCalled();
    expect(orderInventoryOutboxService.createOrderCreatedEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orderIds: ['order-1'],
        reservationId: 'reservation-1',
      }),
    );
    expect(orderCheckoutOutboxService.processEventById).not.toHaveBeenCalled();
    expect(fulfillmentService.assignSellerGroupToOrder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orderId: 'order-1',
        shopId: 'shop-1',
      }),
    );
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
    } = buildService({
      pricedCartSummary: buildPricedCartSummaryMatchingQuote({
        shops: [{
          shopId: 'shop-1',
          shopPublicId: 'shop_public1',
          shopName: 'Shop 1',
          subtotalMinor: 1800,
          discountMinor: 0,
          shippingMinor: 0,
          items: [{ inventoryId: 'inventory-1', quantity: 2, unitPriceCheckoutMinor: 900 }],
        }],
      }),
    });

    await service.createOrders(
      {
        type: 'user',
        userId: 'user-1',
        email: 'member@example.com',
      },
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
          marketCode: 'US',
          presentmentCurrency: 'USD',
          checkoutCurrency: 'USD',
          subtotalMinor: 1800,
          shippingMinor: 0,
          discountMinor: 0,
          saleDiscountMinor: 0,
          totalMinor: 1800,
          shippingAddress,
          shops: [
            {
              shopId: 'shop-1',
              shopPublicId: 'shop_public1',
              shopName: 'Shop 1',
              shopSlug: 'shop-1',
              subtotalMinor: 1800,
              shippingMinor: 0,
              discountMinor: 0,
              saleDiscountMinor: 0,
              shippingDiscountMinor: 0,
              totalMinor: 1800,
              promoCodes: [],
              originCountries: ['US'],
              shippingDiscounts: [],
              items: [
                {
                  inventoryId: 'inventory-1',
                  productId: 'product-1',
                  productPublicId: 'prod_public1',
                  shopId: 'shop-1',
                  shopPublicId: 'shop_public1',
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
                  promoDiscountMinor: 0,
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
              productPublicId: 'prod_public1',
              shopId: 'shop-1',
              shopPublicId: 'shop_public1',
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
              promoDiscountMinor: 0,
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
        saleDiscountMinor: 0,
        totalMinor: 1800,
      }),
    );
    expect(orderTotalPolicyService.assertWithinLimit).toHaveBeenCalledWith({
      totalMinor: 1800,
      currency: 'USD',
    });
    expect(checkoutStockReservationService.reserveForOrder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orderId: 'order-1',
        cartId: 'cart-1',
        expiresAt: expect.any(Date),
        items: [{
          inventoryId: 'inventory-1',
          quantity: 2,
          title: 'Product 1',
        }],
      }),
    );
    expect(checkoutStockReservationService.consumeReservationsForOrder).not.toHaveBeenCalled();
    expect(orderItemRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Product 1',
        imageUrl: 'https://example.com/product-1.png',
        imageReference: 'dev/public/products/product-1/card.webp',
        sku: 'SKU-BLUE',
        unitPriceMinor: 900,
        originalAmountMinor: 1000,
        lineTotalMinor: 1800,
        promoDiscountMinor: 0,
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
      },
      expect.anything(),
    );
    expect(checkoutStockReservationService.reserveForOrder).not.toHaveBeenCalled();
    expect(checkoutStockReservationService.consumeReservationsForOrder).not.toHaveBeenCalled();
    expect(orderRepository.create).not.toHaveBeenCalled();
  });

  it('rejects commitment when the priced cart has no selected items', async () => {
    const {
      service,
      orderRepository,
      orderTotalPolicyService,
    } = buildService({
      pricedCartSummary: {
        ...pricedCartSummary,
        shops: [],
      },
    });

    await expect(
      service.createOrders(
        {
          type: 'user',
          userId: 'user-1',
          email: 'member@example.com',
        },
        cart,
        {
          paymentType: PaymentType.CARD,
          shippingAddress,
          isTempCart: false,
        },
      ),
    ).rejects.toThrow(OrderNoItemsError);

    expect(orderTotalPolicyService.assertWithinLimit).not.toHaveBeenCalled();
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

  function buildAcceptedShipping() {
    const anchorAt = new Date('2026-09-22T10:00:00.000Z');

    return {
      shopId: 'shop-1',
      currency: 'USD',
      charge: {
        currency: 'USD',
        quantity: 2,
        baseUnit: {
          productId: 'product-1',
          inventoryId: 'inventory-1',
          oneItemFeeMinor: 900,
        },
        baseItemFeeMinor: 900,
        baseItemTotalMinor: 900,
        additionalItemsQuantity: 1,
        additionalComponents: [
          {
            productId: 'product-1',
            inventoryId: 'inventory-1',
            quantity: 1,
            additionalItemFeeMinor: 250,
          },
        ],
        additionalItemFeeMinorTotal: 250,
        totalMinor: 1150,
      },
      estimate: {
        processingTimeMinDays: 1,
        processingTimeMaxDays: 3,
        deliveryTimeMinDays: 3,
        deliveryTimeMaxDays: 5,
        combinedMinDays: 4,
        combinedMaxDays: 8,
        anchorAt,
        earliestDeliveryDate: new Date('2026-09-26T00:00:00.000Z'),
        latestDeliveryDate: new Date('2026-09-30T00:00:00.000Z'),
      },
      units: [
        {
          productId: 'product-1',
          inventoryId: 'inventory-1',
          quantity: 2,
          profileId: 'profile-1',
          profileVersion: 3,
          profileShopId: 'shop-1',
          rateId: 'rate-1',
          rateDestinationScope: 'country',
          rateDestinationCountry: 'US',
          rateDestinationRegion: undefined,
          currency: 'USD',
          oneItemFeeMinor: 900,
          additionalItemFeeMinor: 250,
          processingTimeMinDays: 1,
          processingTimeMaxDays: 3,
          deliveryTimeMinDays: 3,
          deliveryTimeMaxDays: 5,
        },
      ],
    };
  }

  /**
   * Pricing that still matches an accepted quote's shops, so commitment's
   * price-freshness revalidation passes and the test reaches the behaviour it
   * targets.
   */
  function buildPricedCartSummaryMatchingQuote(
    quote: {
      shops: Array<{
        shopId: string;
        shopPublicId: string;
        shopName: string;
        subtotalMinor: number;
        discountMinor: number;
        shippingMinor: number;
        items: Array<{
          inventoryId: string;
          quantity: number;
          unitPriceCheckoutMinor: number;
        }>
      }>
    },
  ): PricedCartSummary {
    const shops = quote.shops.map((shop) => ({
      shopId: shop.shopId,
      shopPublicId: shop.shopPublicId,
      shopName: shop.shopName,
      items: shop.items.map((item) => ({
        inventoryId: item.inventoryId,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceCheckoutMinor,
      })) as PricedCartItem[],
      subtotal: shop.subtotalMinor / 100,
      totalDiscount: shop.discountMinor / 100,
      saleDiscount: 0,
      totalShippingFee: shop.shippingMinor / 100,
      total: (shop.subtotalMinor - shop.discountMinor + shop.shippingMinor) / 100,
      promoOffers: [],
      originCountries: [],
    }));

    const subtotalPrice = shops.reduce((total, shop) => total + shop.subtotal, 0);
    const totalDiscount = shops.reduce((total, shop) => total + shop.totalDiscount, 0);
    const totalShippingFee = shops.reduce((total, shop) => total + shop.totalShippingFee, 0);

    return {
      cart,
      currency: 'USD',
      shops,
      subtotalPrice,
      totalDiscount,
      saleDiscount: 0,
      subtotalAfterDiscount: subtotalPrice - totalDiscount,
      totalShippingFee,
      totalPrice: subtotalPrice - totalDiscount + totalShippingFee,
      totalSelectedQuantity: 2,
      totalQuantity: 2,
    };
  }

  function buildQuotedCheckout(totalMinorOverride?: number) {
    const shipping = buildAcceptedShipping();

    return {
      id: 'quote-1',
      cartId: 'cart-1',
      marketCode: 'US',
      presentmentCurrency: 'USD',
      checkoutCurrency: 'USD',
      subtotalMinor: 1800,
      shippingMinor: 1150,
      discountMinor: 0,
      saleDiscountMinor: 0,
      totalMinor: totalMinorOverride ?? 2950,
      shippingAddress,
      shippingAnchorAt: shipping.estimate.anchorAt,
      shops: [
        {
          shopId: 'shop-1',
          shopPublicId: 'shop_public1',
          shopName: 'Shop 1',
          shopSlug: 'shop-1',
          subtotalMinor: 1800,
          shippingMinor: 1150,
          discountMinor: 0,
          saleDiscountMinor: 0,
          shippingDiscountMinor: 0,
          totalMinor: 2950,
          promoCodes: [] as string[],
          originCountries: ['US'],
          shipping,
          shippingDiscounts: [] as unknown[],
          items: [
            {
              inventoryId: 'inventory-1',
              productId: 'product-1',
              productPublicId: 'prod_public1',
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
              promoDiscountMinor: 0,
              currency: 'USD',
              selectedOptions: [],
            },
          ],
        },
      ],
      items: [
        {
          inventoryId: 'inventory-1',
          productId: 'product-1',
          productPublicId: 'prod_public1',
          shopId: 'shop-1',
          shopPublicId: 'shop_public1',
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
          promoDiscountMinor: 0,
          currency: 'USD',
          selectedOptions: [], 
        },
      ],
    };
  }

  describe('OrderCheckoutService accepted shipping facts', () => {
    it('persists the accepted per-shop shipping snapshot and estimate instead of a fabricated date', async () => {
      const quote = buildQuotedCheckout();
      const { service, orderRepository } = buildService({
        pricedCartSummary: buildPricedCartSummaryMatchingQuote(quote),
      });

      await service.createOrders(
        { type: 'user', userId: 'user-1', email: 'member@example.com' },
        cart,
        {
          paymentType: PaymentType.CASH,
          shippingAddress,
          quote: quote as never,
          isTempCart: false,
        },
      );

      const createdOrder = orderRepository.create.mock.results[0]?.value as Record<string, unknown>;

      expect(createdOrder.shippingMinor).toBe(1150);
      expect(createdOrder.totalMinor).toBe(2950);
      expect(createdOrder.shippingEstimatedDelivery).toEqual(
        new Date('2026-09-30T00:00:00.000Z'),
      );
      expect(createdOrder.shippingQuoteSnapshot).toMatchObject({
        shipping: {
          shop_id: 'shop-1',
          charge: expect.objectContaining({ total_minor: 1150 }),
          estimate: expect.objectContaining({
            combined_min_days: 4,
            combined_max_days: 8,
            latest_delivery_date: '2026-09-30T00:00:00.000Z',
          }),
          units: [
            expect.objectContaining({
              profile_id: 'profile-1',
              profile_version: 3,
              rate_id: 'rate-1',
            }),
          ],
        },
        shipping_discount_minor: 0,
        shipping_discounts: [],
      });
    });

    it('refuses to confirm a quote whose Product can no longer be shipped', async () => {
      const { service, orderRepository, shippingQuoteService } = buildService({
        shippingResolutions: [
          {
            productId: 'product-1',
            available: false,
            reason: 'profile_not_ready',
            readinessIssues: ['archived'],
          },
        ],
      });

      await expect(service.createOrders(
        { type: 'user', userId: 'user-1', email: 'member@example.com' },
        cart,
        {
          paymentType: PaymentType.CASH,
          shippingAddress,
          quote: buildQuotedCheckout() as never,
          isTempCart: false,
        },
      )).rejects.toMatchObject({
        constructor: CheckoutShippingUnavailableError,
        products: [
          {
            productId: 'product-1',
            inventoryId: 'inventory-1',
            quantity: 2,
            reason: 'profile_not_ready',
            readinessIssues: ['archived'],
          },
        ],
      });

      expect(shippingQuoteService.resolveForProducts).toHaveBeenCalledWith({
        productIds: ['product-1'],
        destination: { countryCode: 'US' },
      });
      expect(orderRepository.create).not.toHaveBeenCalled();
    });

    it('charges the provider exactly the persisted order money', async () => {
      const { service, orderCheckoutOutboxService } = buildService({
        processResult: undefined,
        pricedCartSummary: buildPricedCartSummaryMatchingQuote(buildQuotedCheckout()),
      });

      await service.createOrders(
        { type: 'user', userId: 'user-1', email: 'member@example.com' },
        cart,
        {
          paymentType: PaymentType.CARD,
          shippingAddress,
          quote: buildQuotedCheckout() as never,
          isTempCart: false,
        },
      );

      expect(
        orderCheckoutOutboxService.createCheckoutSessionRequestedEvent,
      ).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          lineItems: [
            expect.objectContaining({
              name: 'Product 1',
              unitAmountMinor: 900,
              quantity: 2,
            }),
          ],
          shippingAmountMinor: 1150,
          discountAmountMinor: 0,
        }),
      );
    });

    it('refuses to charge an amount that disagrees with the accepted quote total', async () => {
      const { service, orderRepository, orderCheckoutOutboxService } = buildService({
        pricedCartSummary: buildPricedCartSummaryMatchingQuote(buildQuotedCheckout()),
      });

      await expect(service.createOrders(
        { type: 'user', userId: 'user-1', email: 'member@example.com' },
        cart,
        {
          paymentType: PaymentType.CARD,
          shippingAddress,
          quote: buildQuotedCheckout(3000) as never,
          isTempCart: false,
        },
      )).rejects.toThrow('does not match accepted quote total');

      expect(orderRepository.create).toHaveBeenCalled();
      expect(
        orderCheckoutOutboxService.createCheckoutSessionRequestedEvent,
      ).not.toHaveBeenCalled();
    });
  });
});
