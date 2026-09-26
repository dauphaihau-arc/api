import { EntityManager } from '@mikro-orm/postgresql';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { fromMinorUnits, toMinorUnits } from '../../../../platform/money/money';
import { MARKETPLACE_CURRENCIES } from '../../../../platform/config/marketplace.config';
import {
  PRODUCT_INVENTORY_UPDATED_SSE_EVENT,
  type ProductInventoryUpdatedSseEventPayload,
} from '../../../product/app/events/product-inventory-sse.event';
import { dispatchCatalogProductProjections } from '../../../product/app/catalog-product-projection-dispatch';
import { PurchaseEligibilityService } from '../../../product/app/services/purchase-eligibility.service';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { NotifyUserUseCase } from '../../../../domains/notification/app/use-cases/notify-user/notify-user.use-case';
import type { CartSnapshot } from '../../../cart/app/cart.types';
import { CartPricingService } from '../../../cart/app/services/cart-pricing.service';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { CouponUsageEntity } from '../../../coupon/infra/persistence/entities/coupon-usage.entity';
import { CouponEntity } from '../../../coupon/infra/persistence/entities/coupon.entity';
import { ProductEntity } from '../../../product/infra/persistence/mikro-orm/entities/product.entity';
import { ProductInventoryEntity } from '../../../product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import { OrderEventActorType } from '../../domain/enums/order-event-actor-type.enum';
import { OrderEventType } from '../../domain/enums/order-event-type.enum';
import { PaymentType } from '../../domain/enums/payment-type.enum';
import { OrderShippingStatus } from '../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { OrderEntity } from '../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../infra/persistence/entities/order-item.entity';
import { FulfillmentService } from '../../../fulfillment/app/services/fulfillment.service';
import { ShipmentUpdateActorType } from '../../../fulfillment/domain/enums/shipment-update-actor-type.enum';
import { ShipmentUpdateSource } from '../../../fulfillment/domain/enums/shipment-update-source.enum';
import type { LoadedCheckoutQuote } from './load-checkout-quote.service';
import { OrderCheckoutOutboxService } from './order-checkout-outbox.service';
import { CheckoutStockReservationPort } from '../../../checkout/app/ports/checkout-stock-reservation.port';
import {
  CheckoutQuoteReservationOutOfStockError,
  CheckoutQuoteReservationUnavailableError,
  CheckoutShippingUnavailableError,
} from '../errors/order-app.error';
import {
  toPersistedOrderShippingSnapshot,
} from '../../../checkout/app/checkout-shipping-snapshot.contract';
import { ShippingQuoteService } from '../../../shipping/app/services/shipping-quote.service';
import type { ShippingQuoteUnavailableProduct } from '../../../shipping/app/shipping.types';
import { OrderInventoryOutboxService } from './order-inventory-outbox.service';
import { OrderEventsService } from './order-events.service';
import {
  buildSellerOrderCreatedNotification,
  getSellerOrderNotificationRecipientId,
} from '../seller-order-notification';
import { getRequiredOrderNumber } from '../order-number';
import type {
  CheckoutActor,
  CreateOrderResult,
  ShippingAddressInput,
  ShopAdjustmentInput,
} from '../order.types';
import { OrderCartCleanupRepository } from '../ports/order-cart-cleanup.repository';
import { OrderInventoryQueryRepository } from '../ports/order-inventory-query.repository';
import { OrderShopQueryRepository } from '../ports/order-shop-query.repository';
import { OrderTotalPolicyService } from './order-total-policy.service';

const CHECKOUT_SESSION_INLINE_TIMEOUT_MS = 1_500;

@Injectable()
export class OrderCheckoutService {
  private readonly logger = new Logger(OrderCheckoutService.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly cartPricingService: CartPricingService,
    private readonly checkoutStockReservationService: CheckoutStockReservationPort,
    private readonly orderCheckoutOutboxService: OrderCheckoutOutboxService,
    private readonly orderInventoryOutboxService: OrderInventoryOutboxService,
    private readonly orderEventsService: OrderEventsService,
    private readonly notifyUserUseCase: NotifyUserUseCase,
    private readonly eventEmitter: EventEmitter2,
    private readonly jobDispatcher: JobDispatcher,
    private readonly orderTotalPolicyService: OrderTotalPolicyService,
    private readonly orderCartCleanupRepository: OrderCartCleanupRepository,
    private readonly orderInventoryQueryRepository: OrderInventoryQueryRepository,
    private readonly orderShopQueryRepository: OrderShopQueryRepository,
    private readonly purchaseEligibilityService: PurchaseEligibilityService,
    private readonly fulfillmentService: FulfillmentService,
    private readonly shippingQuoteService: ShippingQuoteService,
  ) {}

  async createOrders(
    actor: CheckoutActor,
    cartId: string,
    cart: CartSnapshot,
    input: {
      paymentType: PaymentType;
      currency?: string;
      shippingAddress: ShippingAddressInput;
      shopAdjustments?: ShopAdjustmentInput[];
      quote?: LoadedCheckoutQuote;
      isTempCart: boolean;
    },
  ): Promise<CreateOrderResult> {
    const quote = input.quote;

    const currency = quote
      ? quote.checkoutCurrency
      : normalizeCurrency(input.currency);

    const pricedCartSummary = quote
      ? undefined
      : await this.cartPricingService.buildPricedCartSummary({
        userId: actor.type === 'user' ? actor.userId : undefined,
        cart,
        shippingAddress: input.shippingAddress,
        shopAdjustments: input.shopAdjustments,
      });

    const pricedShops = quote?.shops ?? pricedCartSummary?.shops ?? [];

    if (quote) {
      await this.assertQuoteShippingStillAvailable(quote, input.shippingAddress);
    }

    const totalMinor = quote
      ? quote.totalMinor
      : toMinorUnits(pricedCartSummary?.totalPrice ?? 0, currency);

    if (pricedShops.length === 0) {
      throw new BadRequestException('No selected cart items to order');
    }

    this.orderTotalPolicyService.assertWithinLimit({
      totalMinor,
      currency,
    });

    const result = await this.entityManager.transactional(async (entityManager) => {
      const orderRepository = entityManager.getRepository(OrderEntity);
      const orderItemRepository = entityManager.getRepository(OrderItemEntity);
      const usageRepository = entityManager.getRepository(CouponUsageEntity);
      const createdOrders: OrderEntity[] = [];
      const orderItemsByOrderId = new Map<string, OrderItemEntity[]>();
      let checkoutOutboxEventId: string | undefined;

      const inventoryReservationItems: Array<{
        inventoryId: string;
        productId: string;
        quantity: number;
        title: string;
      }> = pricedShops.flatMap((shop) =>
        shop.items.map((item) => ({
          inventoryId: item.inventoryId,
          productId: item.productId,
          quantity: item.quantity,
          title: item.title,
        })));

      const eligibility = await this.purchaseEligibilityService.evaluate(
        {
          items: inventoryReservationItems,
          requireAvailableQuantity: !quote,
        },
        { entityManager },
      );

      if (!eligibility.eligible) {
        const failure = eligibility.failures[0];

        if (failure?.reason === 'insufficient_available_quantity') {
          throw new CheckoutQuoteReservationOutOfStockError(failure.title);
        }

        throw new CheckoutQuoteReservationUnavailableError();
      }

      if (quote && input.paymentType === PaymentType.CASH) {
        await this.checkoutStockReservationService.consumeReservationsForQuote(entityManager, {
          quoteId: quote.id,
          items: quote.items.map((item) => ({
            inventoryId: item.inventoryId,
            quantity: item.quantity,
          })),
        });
      }

      const { inventoryById, inventoryEvents } = quote
        ? {
          inventoryById: await this.loadInventoryById(entityManager, inventoryReservationItems),
          inventoryEvents: [],
        }
        : await this.checkoutStockReservationService.allocateInventoryForOrderItems(
          entityManager,
          inventoryReservationItems,
          { commandId: `${cartId}:allocate` },
        );

      for (const shop of pricedShops) {
        const quoteShop = quote
          ? shop as LoadedCheckoutQuote['shops'][number]
          : undefined;

        const pricedShop = quote
          ? undefined
          : shop as NonNullable<typeof pricedCartSummary>['shops'][number];

        const shopEntity = await this.orderShopQueryRepository.findByIdWithOwner(
          shop.shopId,
          { entityManager },
        );

        if (!shopEntity) {
          throw new NotFoundException('Shop not found');
        }

        const subtotalMinor = quoteShop
          ? quoteShop.subtotalMinor
          : toMinorUnits(pricedShop!.subtotal, currency);
        const shippingMinor = quoteShop
          ? quoteShop.shippingMinor
          : toMinorUnits(pricedShop!.totalShippingFee, currency);
        const discountMinor = quoteShop
          ? quoteShop.discountMinor
          : toMinorUnits(pricedShop!.totalDiscount, currency);
        // Order money is owned in minor units: the persisted row, the
        // payment-provider charge, and the accepted quote then agree exactly.
        const orderTotalMinor = subtotalMinor - discountMinor + shippingMinor;
        const acceptedShipping = quoteShop?.shipping
          ? {
            shipping: quoteShop.shipping,
            shippingDiscountMinor: quoteShop.shippingDiscountMinor,
            shippingDiscounts: quoteShop.shippingDiscounts,
          }
          : pricedShop?.shipping
            ? {
              shipping: pricedShop.shipping,
              shippingDiscountMinor: pricedShop.shippingDiscountMinor ?? 0,
              shippingDiscounts: pricedShop.shippingDiscounts ?? [],
            }
            : undefined;

        const order = orderRepository.create({
          ...(actor.type === 'user'
            ? { user: entityManager.getReference(UserEntity, actor.userId) }
            : {}),
          customerEmail: actor.email,
          shop: shopEntity,
          paymentType: input.paymentType,
          status: input.paymentType === PaymentType.CASH
            ? OrderStatus.PENDING
            : OrderStatus.CHECKOUT_PENDING,
          shippingStatus: OrderShippingStatus.PRE_TRANSIT,
          currency,
          marketCode: quote?.marketCode ?? shop.items[0]?.marketCode,
          subtotal: fromMinorUnits(subtotalMinor, currency),
          subtotalMinor,
          totalShippingFee: fromMinorUnits(shippingMinor, currency),
          shippingMinor,
          totalDiscount: fromMinorUnits(discountMinor, currency),
          discountMinor,
          total: fromMinorUnits(orderTotalMinor, currency),
          totalMinor: orderTotalMinor,
          note: shop.note,
          promoCodes: quoteShop
            ? quoteShop.promoCodes
            : pricedShop!.promoCoupons.map((coupon) => coupon.code),
          shippingAddress: toPersistedShippingAddress(input.shippingAddress),
          shippingOriginCountries: shop.originCountries,
          shippingToCountry: input.shippingAddress.country,
          // The accepted seller estimate, never a fabricated date.
          shippingEstimatedDelivery: acceptedShipping?.shipping.estimate.latestDeliveryDate,
          ...(acceptedShipping
            ? {
              shippingQuoteSnapshot: toPersistedOrderShippingSnapshot(
                acceptedShipping,
              ) as unknown as Record<string, unknown>,
            }
            : {}),
          paymentDetails: {
            type: input.paymentType,
            cart_id: cartId,
            is_temp_cart: input.isTempCart,
            ...(quote
              ? {
                quote_id: quote.id,
                quoted_inventory_ids: quote.items.map((item) => item.inventoryId),
                reservation_id: quote.reservationId,
              }
              : {}),
          },
        });
        entityManager.persist(order);
        await entityManager.flush();

        if ('refresh' in entityManager && typeof entityManager.refresh === 'function') {
          await entityManager.refresh(order);
        }

        await this.orderEventsService.record(entityManager, {
          order,
          type: OrderEventType.ORDER_CREATED,
          actorType: actor.type === 'user'
            ? OrderEventActorType.BUYER
            : OrderEventActorType.SYSTEM,
          actorId: actor.type === 'user' ? actor.userId : undefined,
          source: actor.type,
          occurredAt: order.createdAt,
          payload: {
            status: order.status,
            shipping_status: order.shippingStatus,
            payment_type: order.paymentType,
          },
        });

        const createdOrderItems: OrderItemEntity[] = [];

        for (const item of shop.items) {
          const quoteItem = quote
            ? item as LoadedCheckoutQuote['items'][number]
            : undefined;

          const pricedItem = quote
            ? undefined
            : item as NonNullable<typeof pricedCartSummary>['shops'][number]['items'][number];

          const inventory = inventoryById.get(item.inventoryId);

          if (!inventory) {
            throw new NotFoundException('Inventory not found');
          }

          const orderItem = orderItemRepository.create({
            order,
            product: entityManager.getReference(ProductEntity, item.productId),
            inventory,
            title: item.title,
            imageUrl: item.imageUrl,
            imageReference: item.imageReference,
            sku: item.sku,
            selectedOptions: item.selectedOptions,
            quantity: item.quantity,
            price: quoteItem
              ? fromMinorUnits(
                quoteItem.originalAmountMinor ?? quoteItem.unitPriceCheckoutMinor,
                currency,
              )
              : pricedItem!.price,
            unitPriceMinor: quoteItem
              ? quoteItem.unitPriceCheckoutMinor
              : toMinorUnits(pricedItem!.effectiveUnitPrice, currency),
            salePrice: quoteItem
              ? (quoteItem.originalAmountMinor
                ? fromMinorUnits(quoteItem.unitPriceCheckoutMinor, currency)
                : undefined)
              : (pricedItem!.effectiveUnitPrice < pricedItem!.price
                ? pricedItem!.effectiveUnitPrice
                : pricedItem!.salePrice),
            originalAmountMinor: quoteItem
              ? quoteItem.originalAmountMinor
              : pricedItem!.effectiveUnitPrice < pricedItem!.price
                ? toMinorUnits(pricedItem!.price, currency)
                : undefined,
            lineTotalMinor: quoteItem
              ? quoteItem.lineTotalCheckoutMinor
              : toMinorUnits(pricedItem!.effectiveUnitPrice, currency) * item.quantity,
            currency,
            sourcePriceId: quoteItem?.sourcePriceId ?? pricedItem?.sourcePriceId,
            sourceType: quoteItem?.sourceType ?? pricedItem?.sourceType,
            marketCode: quoteItem?.marketCode ?? pricedItem?.marketCode,
            fxRate: quoteItem?.fxRate ?? pricedItem?.fxRate,
            fxSource: quoteItem?.fxSource ?? pricedItem?.fxSource,
            fxEffectiveAt: quoteItem?.fxEffectiveAt ?? pricedItem?.fxEffectiveAt,
            fxSourceTimestamp: quoteItem?.fxSourceTimestamp ?? pricedItem?.fxSourceTimestamp,
            percentCouponCode: pricedItem?.autoSaleCoupon?.code,
            percentCouponPercent: pricedItem?.autoSaleCoupon?.percentOff,
          });
          entityManager.persist(orderItem);
          createdOrderItems.push(orderItem);
        }

        if (input.paymentType === PaymentType.CASH) {
          await this.fulfillmentService.assignSellerGroupToOrder(entityManager, {
            orderId: order.id,
            shopId: shopEntity.id,
            items: createdOrderItems.map((orderItem) => ({
              orderItemId: orderItem.id,
              quantity: orderItem.quantity,
            })),
            actor: {
              actorType: actor.type === 'user'
                ? ShipmentUpdateActorType.BUYER
                : ShipmentUpdateActorType.SYSTEM,
              actorId: actor.type === 'user' ? actor.userId : undefined,
              source: ShipmentUpdateSource.CHECKOUT,
            },
          });
        }

        // Coupon usage and provenance are preserved for both the quoted and the
        // directly-priced path: every accepted code increments its usage and
        // records an order-scoped usage row.
        const appliedCoupons = pricedShop
          ? pricedShop.promoCoupons
          : quoteShop && quoteShop.promoCodes.length > 0
            ? await entityManager.getRepository(CouponEntity).find({
              shop: shopEntity.id,
              code: { $in: quoteShop.promoCodes },
            })
            : [];

        for (const coupon of appliedCoupons) {
          coupon.usesCount += 1;
          const usage = usageRepository.create({
            coupon,
            ...(actor.type === 'user'
              ? { user: entityManager.getReference(UserEntity, actor.userId) }
              : {}),
            orderId: order.id,
            code: coupon.code,
          });
          entityManager.persist(usage);
        }

        orderItemsByOrderId.set(order.id, createdOrderItems);
        createdOrders.push(order);
      }

      if (input.paymentType === PaymentType.CASH) {
        await this.orderCartCleanupRepository.clearCheckoutCart({
          cartId,
          isTempCart: input.isTempCart,
          inventoryIds: quote?.items.map((item) => item.inventoryId),
        }, { entityManager });
      }

      if (input.paymentType === PaymentType.CARD) {
        // The provider is charged from the persisted Order rows, not from a
        // re-derivation of current configuration, so the payment session, the
        // confirmed Orders, and the accepted quote agree exactly in minor units.
        const lineItems = createdOrders.flatMap((order) =>
          (orderItemsByOrderId.get(order.id) ?? []).map((item) => ({
            name: item.title,
            imageUrl: item.imageUrl,
            unitAmountMinor: item.unitPriceMinor,
            quantity: item.quantity,
          })));

        const shippingAmountMinor = createdOrders.reduce(
          (total, order) => total + order.shippingMinor,
          0,
        );
        const discountAmountMinor = createdOrders.reduce(
          (total, order) => total + order.discountMinor,
          0,
        );
        const orderTotalMinor = createdOrders.reduce(
          (total, order) => total + order.totalMinor,
          0,
        );
        const chargedTotalMinor = lineItems.reduce(
          (total, item) => total + (item.unitAmountMinor * item.quantity),
          0,
        ) + shippingAmountMinor - discountAmountMinor;

        if (chargedTotalMinor !== orderTotalMinor) {
          throw new Error(
            `Checkout amounts disagree: provider charge ${chargedTotalMinor} does not match persisted order total ${orderTotalMinor}`,
          );
        }

        if (quote && orderTotalMinor !== quote.totalMinor) {
          throw new Error(
            `Checkout amounts disagree: persisted order total ${orderTotalMinor} does not match accepted quote total ${quote.totalMinor}`,
          );
        }

        const outboxEvent = await this.orderCheckoutOutboxService.createCheckoutSessionRequestedEvent(
          entityManager,
          {
            userId: actor.type === 'user' ? actor.userId : undefined,
            customerEmail: actor.email,
            cartId,
            orderIds: createdOrders.map((order) => order.id),
            currency,
            lineItems,
            shippingAmountMinor,
            discountAmountMinor,
            shippingAddress: input.shippingAddress,
          },
        );

        checkoutOutboxEventId = outboxEvent.id;
      }

      if (quote && input.paymentType === PaymentType.CASH) {
        await this.orderInventoryOutboxService.createOrderCreatedEvent(
          entityManager,
          {
            orderIds: createdOrders.map((order) => order.id),
            quoteId: quote.id,
            reservationId: quote.reservationId,
            items: quote.items.map((item) => ({
              inventoryId: item.inventoryId,
              quantity: item.quantity,
            })),
          },
        );
      }

      await entityManager.flush();

      return {
        checkoutPending: input.paymentType === PaymentType.CARD,
        checkoutOutboxEventId,
        inventoryEvents,
        orderShops: createdOrders.map((order) => ({
          id: order.id,
          orderNumber: getRequiredOrderNumber(order),
          shopId: order.shop.id,
          shopName: order.shop.shopName,
          shopSlug: order.shop.slug,
          ownerUserId: getSellerOrderNotificationRecipientId(order),
        })),
      };
    });

    const checkoutSession = result.checkoutOutboxEventId
      ? await this.tryProcessCheckoutSessionRequest(result.checkoutOutboxEventId)
      : undefined;

    this.emitInventoryEventsAfterCheckout(result.inventoryEvents);

    await dispatchCatalogProductProjections(
      this.jobDispatcher,
      result.inventoryEvents.map((event) => event.productId),
    );

    this.notifySellersAfterCheckout(result.orderShops);

    return {
      checkoutPending: result.checkoutPending && !checkoutSession?.url,
      checkoutSessionId: checkoutSession?.id,
      checkoutSessionUrl: checkoutSession?.url,
      orderShops: result.orderShops,
    };
  }

  private async tryProcessCheckoutSessionRequest(
    checkoutOutboxEventId: string,
  ): Promise<{ id: string; url: string } | undefined> {
    let timeout: NodeJS.Timeout | number | undefined;

    try {
      return await Promise.race([
        this.orderCheckoutOutboxService.processEventById(checkoutOutboxEventId),
        new Promise<undefined>((resolve) => {
          timeout = setTimeout(resolve, CHECKOUT_SESSION_INLINE_TIMEOUT_MS);
        }),
      ]);
    }
    finally {
      clearTimeout(timeout);
    }
  }

  private emitInventoryEventsAfterCheckout(
    inventoryEvents: ProductInventoryUpdatedSseEventPayload[],
  ): void {
    for (const inventoryEvent of inventoryEvents) {
      setImmediate(() => {
        this.eventEmitter.emit(PRODUCT_INVENTORY_UPDATED_SSE_EVENT, inventoryEvent);
      });
    }
  }

  private notifySellersAfterCheckout(orderShops: Array<{
    id: string;
    orderNumber: string;
    shopId: string;
    ownerUserId?: string | null;
  }>): void {
    for (const orderShop of orderShops) {
      if (!orderShop.ownerUserId) {
        continue;
      }

      const ownerUserId = orderShop.ownerUserId;
      setImmediate(() => {
        void this.notifyUserUseCase.execute(
          buildSellerOrderCreatedNotification(
            ownerUserId,
            orderShop.id,
            orderShop.orderNumber,
            orderShop.shopId,
          ),
        ).catch((error) => {
          this.logger.error(
            `Failed to schedule seller order notification for order ${orderShop.id}`,
            error instanceof Error ? error.stack : undefined,
          );
        });
      });
    }
  }

  /**
   * Confirming an accepted quote revalidates that every quoted Product can
   * still be delivered to the quoted destination: its assignment, profile
   * lifecycle and readiness, and the matched destination rate. It never
   * reprices the accepted quote from current configuration; a Product that
   * became undeliverable fails the confirmation instead.
   */
  private async assertQuoteShippingStillAvailable(
    quote: LoadedCheckoutQuote,
    shippingAddress: ShippingAddressInput,
  ): Promise<void> {
    const units = quote.items.map((item) => ({
      productId: item.productId,
      inventoryId: item.inventoryId,
      quantity: item.quantity,
    }));
    const resolutions = await this.shippingQuoteService.resolveForProducts({
      productIds: [...new Set(units.map((unit) => unit.productId))],
      destination: {
        countryCode: shippingAddress.country,
      },
    });
    const resolutionByProductId = new Map(
      resolutions.map((resolution) => [resolution.productId, resolution]),
    );

    const unavailable: ShippingQuoteUnavailableProduct[] = [];

    for (const unit of units) {
      const resolution = resolutionByProductId.get(unit.productId);

      if (resolution?.available) {
        continue;
      }

      unavailable.push({
        productId: unit.productId,
        inventoryId: unit.inventoryId,
        quantity: unit.quantity,
        reason: resolution?.reason ?? 'missing_assignment',
        readinessIssues: resolution?.readinessIssues ?? [],
      });
    }

    if (unavailable.length > 0) {
      throw new CheckoutShippingUnavailableError(unavailable);
    }
  }

  private async loadInventoryById(
    entityManager: EntityManager,
    items: Array<{ inventoryId: string }>,
  ): Promise<Map<string, ProductInventoryEntity>> {
    const inventoryIds = [...new Set(items.map((item) => item.inventoryId))].sort();
    const inventoryById = await this.orderInventoryQueryRepository.findByIds(
      inventoryIds,
      { entityManager },
    );

    for (const inventoryId of inventoryIds) {
      if (!inventoryById.has(inventoryId)) {
        throw new NotFoundException('Inventory not found');
      }
    }

    return inventoryById;
  }
}

function normalizeCurrency(currency?: string): string {
  return currency && MARKETPLACE_CURRENCIES.includes(currency as (typeof MARKETPLACE_CURRENCIES)[number])
    ? currency
    : 'USD';
}

function toPersistedShippingAddress(input: ShippingAddressInput) {
  return {
    full_name: input.fullName,
    address1: input.address1,
    address2: input.address2,
    city: input.city,
    country: input.country,
    state: input.state,
    zip: input.zip,
    phone: input.phone,
  };
}
