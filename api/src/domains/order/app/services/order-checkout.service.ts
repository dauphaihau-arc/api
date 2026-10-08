import { EntityManager } from '@mikro-orm/postgresql';
import {
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { fromMinorUnits } from '../../../../platform/money/money';
import { MARKETPLACE_CURRENCIES } from '../../../../platform/config/marketplace.config';
import { appJobDeduplicationKey } from '../../../../platform/jobs/app-job-deduplication';
import { appJobName } from '../../../../platform/jobs/app-job.names';
import {
  PAYMENT_CONFIG,
  type PaymentConfig,
} from '../../../../platform/config/payment.config';
import { dispatchCatalogProductProjections } from '../../../product/app/catalog-product-projection-dispatch';
import { PurchaseEligibilityService } from '../../../product/app/services/purchase-eligibility.service';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { NotifyUserUseCase } from '../../../../domains/notification/app/use-cases/notify-user/notify-user.use-case';
import type { CartSnapshot } from '../../../cart/app/cart.types';
import { CartPricingService } from '../../../cart/app/services/cart-pricing.service';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { PromotionCodeEntity } from '../../../promotion/infra/persistence/entities/promotion-code.entity';
import { PromotionRedemptionService } from '../../../promotion/app/services/promotion-redemption.service';
import {
  PromotionRedemptionLimitReachedError,
  PromotionRedemptionRequiresAuthenticatedBuyerError,
} from '../../../promotion/domain/promotion-redemption';
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
  CheckoutAmountsAgreementError,
  CheckoutQuotePricesChangedError,
  CheckoutQuoteReservationOutOfStockError,
  CheckoutQuoteReservationUnavailableError,
  CheckoutShippingUnavailableError,
  OrderInventoryNotFoundError,
  OrderNoItemsError,
  OrderShopNotFoundError,
} from '../errors/order-app.error';
import {
  buildRefreshedCheckoutTotals,
  resolveRefreshedCheckoutTotals,
} from '../../../checkout/app/services/checkout-quote-price-freshness';
import {
  toPersistedOrderShippingSnapshot,
} from '../../../checkout/app/checkout-shipping-snapshot.contract';
import { ShippingQuoteService } from '../../../shipping/app/services/shipping-quote.service';
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
import type { PromoOffer } from '../../../promotion/app/types/promo-offer.mapper';
import { promotionCodeEntityToPromoOffer } from '../../../promotion/app/types/promo-offer.mapper';
import { OrderCartCleanupRepository } from '../ports/order-cart-cleanup.repository';
import { OrderInventoryQueryRepository } from '../ports/order-inventory-query.repository';
import { OrderShopQueryRepository } from '../ports/order-shop-query.repository';
import { OrderTotalPolicyService } from './order-total-policy.service';
import {
  resolveCheckoutForCommit,
  type ResolvedCheckout,
  type ResolvedCheckoutShop,
} from './checkout-commit-resolution';

const CHECKOUT_SESSION_INLINE_TIMEOUT_MS = 1_500;
// Card Orders hold stock until the payment session resolves; the hold is
// released by the provider expiry webhook, with this delayed cleanup as the
// fallback when that webhook never arrives. The hold is the session lifetime
// plus this grace, so the fallback can never release stock for a session the
// buyer can still pay.
const CHECKOUT_HOLD_RELEASE_GRACE_MS = 5 * 60 * 1000;

export interface CreateOrdersInput {
  paymentType: PaymentType;
  currency?: string;
  shippingAddress: ShippingAddressInput;
  shopAdjustments?: ShopAdjustmentInput[];
  quote?: LoadedCheckoutQuote;
  isTempCart: boolean;
}

interface CheckoutCommitContext {
  actor: CheckoutActor;
  cartId: string;
  input: CreateOrdersInput;
  quote?: LoadedCheckoutQuote;
  currency: string;
  resolved: ResolvedCheckout;
}

interface CheckoutCardHold {
  orderId: string;
  reservationId?: string;
}

interface CheckoutCommitResult {
  checkoutPending: boolean;
  checkoutOutboxEventId?: string;
  cardHolds: CheckoutCardHold[];
  reservedProductIds: string[];
  orderShops: Array<{
    id: string;
    publicId: string;
    orderNumber: string;
    shopId: string;
    shopPublicId: string;
    shopName: string;
    shopSlug: string;
    ownerUserId?: string | null;
  }>;
}

interface CheckoutInventoryItem {
  inventoryId: string;
  productId: string;
  quantity: number;
  title: string;
}

@Injectable()
export class OrderCheckoutService {
  private readonly logger = new Logger(OrderCheckoutService.name);

  // Session lifetime plus the release grace: the Card hold is derived once from
  // the payment configuration so both the reservation expiry and the fallback
  // cleanup delay stay in lockstep with the payable window.
  private readonly checkoutHoldTtlMs: number;

  constructor(
    private readonly entityManager: EntityManager,
    private readonly cartPricingService: CartPricingService,
    private readonly checkoutStockReservationService: CheckoutStockReservationPort,
    private readonly orderCheckoutOutboxService: OrderCheckoutOutboxService,
    private readonly orderInventoryOutboxService: OrderInventoryOutboxService,
    private readonly orderEventsService: OrderEventsService,
    private readonly notifyUserUseCase: NotifyUserUseCase,
    private readonly jobDispatcher: JobDispatcher,
    private readonly orderTotalPolicyService: OrderTotalPolicyService,
    private readonly orderCartCleanupRepository: OrderCartCleanupRepository,
    private readonly orderInventoryQueryRepository: OrderInventoryQueryRepository,
    private readonly orderShopQueryRepository: OrderShopQueryRepository,
    private readonly purchaseEligibilityService: PurchaseEligibilityService,
    private readonly promotionRedemptionService: PromotionRedemptionService,
    private readonly fulfillmentService: FulfillmentService,
    private readonly shippingQuoteService: ShippingQuoteService,
    @Inject(PAYMENT_CONFIG) paymentConfig: PaymentConfig,
  ) {
    this.checkoutHoldTtlMs =
      paymentConfig.checkoutSessionTtlMs + CHECKOUT_HOLD_RELEASE_GRACE_MS;
  }

  async createOrders(
    actor: CheckoutActor,
    cart: CartSnapshot,
    input: CreateOrdersInput,
  ): Promise<CreateOrderResult> {
    const cartId = cart.id;

    const quote = input.quote;

    const currency = quote
      ? quote.checkoutCurrency
      : normalizeCurrency(input.currency);

    if (quote) {
      await this.assertQuoteShippingStillAvailable(quote, input.shippingAddress);
    }

    const pricedCartSummary = await this.cartPricingService.buildPricedCartSummary({
      userId: actor.type === 'user' ? actor.userId : undefined,
      cart,
      shippingAddress: input.shippingAddress,
      shopAdjustments: input.shopAdjustments,
    });

    if (quote) {
      // An accepted quote is never a price reservation: the cart does not lock
      // Sale prices, so the totals are re-derived here and compared with what
      // the buyer accepted. A difference fails the commitment instead of
      // charging an amount the buyer never agreed to.
      const refreshedTotals = resolveRefreshedCheckoutTotals(quote, pricedCartSummary);

      if (refreshedTotals) {
        throw new CheckoutQuotePricesChangedError(refreshedTotals);
      }
    }

    const resolved = resolveCheckoutForCommit({ quote, pricedCartSummary, currency });

    if (resolved.shops.length === 0) {
      throw new OrderNoItemsError();
    }

    this.orderTotalPolicyService.assertWithinLimit({
      totalMinor: resolved.totalMinor,
      currency,
    });

    const context: CheckoutCommitContext = {
      actor,
      cartId,
      input,
      quote,
      currency,
      resolved,
    };

    const result = await this.entityManager
      .transactional((entityManager) => this.commitOrders(entityManager, context))
      .catch(async (error: unknown) => this.remapRedemptionFailure(error, {
        quote,
        cart,
        userId: actor.type === 'user' ? actor.userId : undefined,
        shippingAddress: input.shippingAddress,
        shopAdjustments: input.shopAdjustments,
      }));

    const checkoutSession = result.checkoutOutboxEventId
      ? await this.tryProcessCheckoutSessionRequest(result.checkoutOutboxEventId)
      : undefined;

    await dispatchCatalogProductProjections(this.jobDispatcher, result.reservedProductIds);

    await this.scheduleCardHoldCleanup(result.cardHolds);

    this.notifySellersAfterCheckout(result.orderShops);

    return {
      checkoutPending: result.checkoutPending && !checkoutSession?.url,
      checkoutSessionId: checkoutSession?.id,
      checkoutSessionUrl: checkoutSession?.url,
      orderShops: result.orderShops,
    };
  }

  /**
   * The single commitment transaction. The order lifecycle is identical for
   * every payment type — eligibility, the order-owned stock hold, the
   * persisted Order and lines, redemption — and only the settlement of that
   * hold and the checkout hand-off differ, so the payment split lives in the
   * two settlement calls at the end rather than in two duplicated bodies.
   */
  private async commitOrders(
    entityManager: EntityManager,
    context: CheckoutCommitContext,
  ): Promise<CheckoutCommitResult> {
    const {
      actor,
      cartId,
      currency,
      input,
      resolved,
    } = context;

    const isCash = input.paymentType === PaymentType.CASH;

    const reservationItems: CheckoutInventoryItem[] = resolved.shops.flatMap((shop) =>
      shop.items.map((item) => ({
        inventoryId: item.inventoryId,
        productId: item.productId,
        quantity: item.quantity,
        title: item.title,
      })));

    const eligibility = await this.purchaseEligibilityService.evaluate(
      { items: reservationItems },
      { entityManager },
    );

    if (!eligibility.eligible) {
      const failure = eligibility.failures[0];

      if (failure?.reason === 'insufficient_available_quantity') {
        throw new CheckoutQuoteReservationOutOfStockError(failure.title);
      }

      throw new CheckoutQuoteReservationUnavailableError();
    }

    // Stock is held by the Order, never by the accepted quote: every Order in
    // this commitment takes its own hold inside this transaction, and a cash
    // Order consumes it immediately.
    const inventoryById = await this.loadInventoryById(entityManager, reservationItems);

    const orderRepository = entityManager.getRepository(OrderEntity);
    const createdOrders: OrderEntity[] = [];
    const orderItemsByOrderId = new Map<string, OrderItemEntity[]>();
    const orderReservationIds = new Map<string, string | undefined>();
    const cardHolds: CheckoutCardHold[] = [];
    const holdExpiresAt = new Date(Date.now() + this.checkoutHoldTtlMs);

    for (const shop of resolved.shops) {
      const shopEntity = await this.orderShopQueryRepository.findByIdWithOwner(
        shop.shopId,
        { entityManager },
      );

      if (!shopEntity) {
        throw new OrderShopNotFoundError();
      }

      const order = orderRepository.create({
        ...(actor.type === 'user'
          ? { user: entityManager.getReference(UserEntity, actor.userId) }
          : {}),
        customerEmail: actor.email,
        shop: shopEntity,
        paymentType: input.paymentType,
        status: isCash ? OrderStatus.PENDING : OrderStatus.CHECKOUT_PENDING,
        shippingStatus: OrderShippingStatus.PRE_TRANSIT,
        currency,
        marketCode: shop.marketCode,
        subtotal: fromMinorUnits(shop.subtotalMinor, currency),
        subtotalMinor: shop.subtotalMinor,
        totalShippingFee: fromMinorUnits(shop.shippingMinor, currency),
        shippingMinor: shop.shippingMinor,
        totalDiscount: fromMinorUnits(shop.discountMinor, currency),
        discountMinor: shop.discountMinor,
        saleDiscountMinor: shop.saleDiscountMinor,
        total: fromMinorUnits(shop.totalMinor, currency),
        totalMinor: shop.totalMinor,
        note: shop.note,
        promoCodes: shop.promoCodes,
        shippingAddress: toPersistedShippingAddress(input.shippingAddress),
        shippingOriginCountries: shop.originCountries,
        shippingToCountry: input.shippingAddress.country,
        // The accepted seller estimate, never a fabricated date.
        shippingEstimatedDelivery: shop.shipping?.shipping.estimate.latestDeliveryDate,
        ...(shop.shipping
          ? {
            shippingQuoteSnapshot: toPersistedOrderShippingSnapshot(
              shop.shipping,
            ) as unknown as Record<string, unknown>,
          }
          : {}),
        paymentDetails: {
          type: input.paymentType,
          cart_id: cartId,
          is_temp_cart: input.isTempCart,
          ...(context.quote
            ? {
              quote_id: context.quote.id,
              quoted_inventory_ids: context.quote.items.map((item) => item.inventoryId),
            }
            : {}),
        },
      });
      entityManager.persist(order);
      await entityManager.flush();

      if ('refresh' in entityManager && typeof entityManager.refresh === 'function') {
        await entityManager.refresh(order);
      }

      const shopInventoryItems = shop.items.map((item) => ({
        inventoryId: item.inventoryId,
        quantity: item.quantity,
        title: item.title,
      }));

      const reservationResult = await this.checkoutStockReservationService.reserveForOrder(
        entityManager,
        {
          orderId: order.id,
          cartId,
          expiresAt: holdExpiresAt,
          items: shopInventoryItems,
        },
      );
      const reservationId = reservationResult?.reservationId;
      orderReservationIds.set(order.id, reservationId);

      if (reservationId) {
        order.paymentDetails = {
          ...(order.paymentDetails ?? {}),
          reservation_id: reservationId,
        };
      }

      await this.applyReservationSettlement(entityManager, {
        isCash,
        orderId: order.id,
        reservationId,
        shopInventoryItems,
        cardHolds,
      });

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

      const createdOrderItems = this.persistOrderItems(
        entityManager,
        order,
        shop,
        inventoryById,
        currency,
      );

      if (isCash) {
        await this.assignCashFulfillment(entityManager, {
          orderId: order.id,
          shopId: shopEntity.id,
          orderItems: createdOrderItems,
          actorType: actor.type === 'user'
            ? ShipmentUpdateActorType.BUYER
            : ShipmentUpdateActorType.SYSTEM,
          actorId: actor.type === 'user' ? actor.userId : undefined,
        });
      }

      await this.redeemPromotions(entityManager, context, {
        orderId: order.id,
        shopId: shopEntity.id,
        shop,
      });

      orderItemsByOrderId.set(order.id, createdOrderItems);
      createdOrders.push(order);
    }

    const checkoutOutboxEventId = isCash
      ? await this.settleCashCheckout(entityManager, context, {
        createdOrders,
        orderItemsByOrderId,
        orderReservationIds,
      })
      : await this.startCardCheckout(entityManager, context, {
        createdOrders,
        orderItemsByOrderId,
      });

    await entityManager.flush();

    return {
      checkoutPending: input.paymentType === PaymentType.CARD,
      checkoutOutboxEventId,
      cardHolds,
      reservedProductIds: [...new Set(reservationItems.map((item) => item.productId))],
      orderShops: createdOrders.map((order) => ({
        id: order.id,
        publicId: order.publicId,
        orderNumber: getRequiredOrderNumber(order),
        shopId: order.shop.id,
        shopPublicId: order.shop.publicId,
        shopName: order.shop.shopName,
        shopSlug: order.shop.slug,
        ownerUserId: getSellerOrderNotificationRecipientId(order),
      })),
    };
  }

  /**
   * Consumes the hold for a cash Order or records it as a Card hold the
   * provider will settle. Both branches write the same order-owned reservation;
   * only the moment the stock leaves the pool differs.
   */
  private async applyReservationSettlement(
    entityManager: EntityManager,
    args: {
      isCash: boolean;
      orderId: string;
      reservationId?: string;
      shopInventoryItems: Array<{ inventoryId: string; quantity: number; title: string }>;
      cardHolds: CheckoutCardHold[];
    },
  ): Promise<void> {
    if (!args.isCash) {
      args.cardHolds.push({ orderId: args.orderId, reservationId: args.reservationId });
      return;
    }

    await this.checkoutStockReservationService.consumeReservationsForOrder(
      entityManager,
      {
        orderId: args.orderId,
        reservationId: args.reservationId,
        items: args.shopInventoryItems.map((item) => ({
          inventoryId: item.inventoryId,
          quantity: item.quantity,
        })),
      },
    );
  }

  private persistOrderItems(
    entityManager: EntityManager,
    order: OrderEntity,
    shop: ResolvedCheckoutShop,
    inventoryById: Map<string, ProductInventoryEntity>,
    currency: string,
  ): OrderItemEntity[] {
    const orderItemRepository = entityManager.getRepository(OrderItemEntity);
    const createdOrderItems: OrderItemEntity[] = [];

    for (const item of shop.items) {
      const inventory = inventoryById.get(item.inventoryId);

      if (!inventory) {
        throw new OrderInventoryNotFoundError();
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
        price: item.priceMajor,
        unitPriceMinor: item.unitPriceMinor,
        salePrice: item.salePriceMajor,
        originalAmountMinor: item.originalAmountMinor,
        lineTotalMinor: item.lineTotalMinor,
        promoDiscountMinor: item.promoDiscountMinor,
        currency,
        sourcePriceId: item.sourcePriceId,
        sourceType: item.sourceType,
        marketCode: item.marketCode,
        fxRate: item.fxRate,
        fxSource: item.fxSource,
        fxEffectiveAt: item.fxEffectiveAt,
        fxSourceTimestamp: item.fxSourceTimestamp,
      });
      entityManager.persist(orderItem);
      createdOrderItems.push(orderItem);
    }

    return createdOrderItems;
  }

  private async assignCashFulfillment(
    entityManager: EntityManager,
    args: {
      orderId: string;
      shopId: string;
      orderItems: OrderItemEntity[];
      actorType: ShipmentUpdateActorType;
      actorId?: string;
    },
  ): Promise<void> {
    await this.fulfillmentService.assignSellerGroupToOrder(entityManager, {
      orderId: args.orderId,
      shopId: args.shopId,
      items: args.orderItems.map((orderItem) => ({
        orderItemId: orderItem.id,
        quantity: orderItem.quantity,
      })),
      actor: {
        actorType: args.actorType,
        actorId: args.actorId,
        source: ShipmentUpdateSource.CHECKOUT,
      },
    });
  }

  /**
   * Promotion usage is preserved for both the quoted and the directly-priced
   * path: every accepted code records an order-scoped redemption. Promotion
   * redemptions go through the owning domain, which locks the allowance,
   * rejects an exhausted code inside this same transaction, and stays
   * idempotent per order.
   */
  private async redeemPromotions(
    entityManager: EntityManager,
    context: CheckoutCommitContext,
    args: { orderId: string; shopId: string; shop: ResolvedCheckoutShop },
  ): Promise<void> {
    const appliedOffers = args.shop.appliedOffers ??
      await this.resolveAppliedOffers(entityManager, args.shopId, args.shop.promoCodes);

    await this.promotionRedemptionService.consumeForOrder(entityManager, {
      shopId: args.shopId,
      codes: appliedOffers.map((offer) => offer.code),
      orderId: args.orderId,
      ...(context.actor.type === 'user' ? { userId: context.actor.userId } : {}),
    });
  }

  private async settleCashCheckout(
    entityManager: EntityManager,
    context: CheckoutCommitContext,
    args: {
      createdOrders: OrderEntity[];
      orderItemsByOrderId: Map<string, OrderItemEntity[]>;
      orderReservationIds: Map<string, string | undefined>;
    },
  ): Promise<undefined> {
    await this.orderCartCleanupRepository.clearCheckoutCart({
      cartId: context.cartId,
      isTempCart: context.input.isTempCart,
      inventoryIds: context.quote?.items.map((item) => item.inventoryId),
    }, { entityManager });

    // One `order.created` per Order: each Order owns its reservation, so the
    // inventory-service consumes exactly that Order's hold.
    for (const order of args.createdOrders) {
      await this.orderInventoryOutboxService.createOrderCreatedEvent(
        entityManager,
        {
          orderIds: [order.id],
          reservationId: args.orderReservationIds.get(order.id),
          items: (args.orderItemsByOrderId.get(order.id) ?? []).map((item) => ({
            inventoryId: item.inventory.id,
            quantity: item.quantity,
          })),
        },
      );
    }

    return undefined;
  }

  private async startCardCheckout(
    entityManager: EntityManager,
    context: CheckoutCommitContext,
    args: {
      createdOrders: OrderEntity[];
      orderItemsByOrderId: Map<string, OrderItemEntity[]>;
    },
  ): Promise<string | undefined> {
    // The provider is charged from the persisted Order rows, not from a
    // re-derivation of current configuration, so the payment session, the
    // confirmed Orders, and the accepted quote agree exactly in minor units.
    const lineItems = args.createdOrders.flatMap((order) =>
      (args.orderItemsByOrderId.get(order.id) ?? []).map((item) => ({
        name: item.title,
        imageUrl: item.imageUrl,
        unitAmountMinor: item.unitPriceMinor,
        quantity: item.quantity,
      })));

    const shippingAmountMinor = args.createdOrders.reduce(
      (total, order) => total + order.shippingMinor,
      0,
    );
    const discountAmountMinor = args.createdOrders.reduce(
      (total, order) => total + order.discountMinor,
      0,
    );
    const orderTotalMinor = args.createdOrders.reduce(
      (total, order) => total + order.totalMinor,
      0,
    );
    const chargedTotalMinor = lineItems.reduce(
      (total, item) => total + (item.unitAmountMinor * item.quantity),
      0,
    ) + shippingAmountMinor - discountAmountMinor;

    if (chargedTotalMinor !== orderTotalMinor) {
      throw new CheckoutAmountsAgreementError(
        `Checkout amounts disagree: provider charge ${chargedTotalMinor} does not match persisted order total ${orderTotalMinor}`,
      );
    }

    if (context.quote && orderTotalMinor !== context.quote.totalMinor) {
      throw new CheckoutAmountsAgreementError(
        `Checkout amounts disagree: persisted order total ${orderTotalMinor} does not match accepted quote total ${context.quote.totalMinor}`,
      );
    }

    const outboxEvent = await this.orderCheckoutOutboxService.createCheckoutSessionRequestedEvent(
      entityManager,
      {
        userId: context.actor.type === 'user' ? context.actor.userId : undefined,
        customerEmail: context.actor.email,
        cartId: context.cartId,
        orderIds: args.createdOrders.map((order) => order.id),
        currency: context.currency,
        lineItems,
        shippingAmountMinor,
        discountAmountMinor,
        shippingAddress: context.input.shippingAddress,
      },
    );

    return outboxEvent.id;
  }

  /**
   * A redemption-limit failure discovered inside the commit transaction means
   * the accepted quote can no longer be honoured: the code that priced it is
   * exhausted or no longer available to this buyer. The order rolls back, the
   * cart is re-priced without the failed code, and the buyer receives the
   * refreshed totals to accept before retrying.
   */
  private async remapRedemptionFailure(
    error: unknown,
    context: {
      quote?: LoadedCheckoutQuote;
      cart: CartSnapshot;
      userId?: string;
      shippingAddress: ShippingAddressInput;
      shopAdjustments?: ShopAdjustmentInput[];
    },
  ): Promise<never> {
    if (
      !(error instanceof PromotionRedemptionLimitReachedError)
      && !(error instanceof PromotionRedemptionRequiresAuthenticatedBuyerError)
    ) {
      throw error;
    }

    if (!context.quote) {
      throw error;
    }

    const refreshedSummary = await this.cartPricingService.buildPricedCartSummary({
      userId: context.userId,
      cart: context.cart,
      shippingAddress: context.shippingAddress,
      shopAdjustments: context.shopAdjustments,
    });

    throw new CheckoutQuotePricesChangedError(
      buildRefreshedCheckoutTotals(context.quote, refreshedSummary),
    );
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

  /**
   * Fallback release for a card Order's hold when the provider expiry webhook
   * never arrives: the hold outlives the payment attempt, so it must expire on
   * its own schedule.
   */
  private async scheduleCardHoldCleanup(
    holds: CheckoutCardHold[],
  ): Promise<void> {
    for (const hold of holds) {
      await this.jobDispatcher.dispatch(
        appJobName.cleanupExpiredOrderReservations,
        {
          orderId: hold.orderId,
          ...(hold.reservationId ? { reservationId: hold.reservationId } : {}),
        },
        {
          deduplicationKey: appJobDeduplicationKey.cleanupExpiredOrderReservations(
            hold.orderId,
          ),
          delayMs: this.checkoutHoldTtlMs,
        },
      );
    }
  }

  private notifySellersAfterCheckout(orderShops: Array<{
    id: string;
    publicId: string;
    orderNumber: string;
    shopPublicId: string;
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
            orderShop.publicId,
            orderShop.orderNumber,
            orderShop.shopPublicId,
          ),
        ).catch((error) => {
          this.logger.error(
            `Failed to schedule seller order notification for order ${orderShop.publicId}`,
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
      productPublicId: item.productPublicId,
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

    const unavailable: ConstructorParameters<typeof CheckoutShippingUnavailableError>[0] = [];

    for (const unit of units) {
      const resolution = resolutionByProductId.get(unit.productId);

      if (resolution?.available) {
        continue;
      }

      unavailable.push({
        productId: unit.productId,
        productPublicId: unit.productPublicId,
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

  private async resolveAppliedOffers(
    entityManager: EntityManager,
    shopId: string,
    promoCodes: string[],
  ): Promise<PromoOffer[]> {
    if (promoCodes.length === 0) {
      return [];
    }

    const codes = [...new Set(promoCodes.map((code) => code.trim().toUpperCase()))];
    const promotionCodes = await entityManager.getRepository(PromotionCodeEntity).find(
      { shopId, code: { $in: codes } },
      { populate: ['promotion', 'promotion.products'] },
    );

    const productIds = [...new Set(promotionCodes.flatMap((code) =>
      code.promotion.products.getItems().map((product) => product.productId)))];
    const products = productIds.length > 0
      ? await entityManager.getRepository(ProductEntity).find({ id: { $in: productIds } }, { fields: ['id', 'publicId'] })
      : [];
    const publicIdByProductId = new Map(products.map((product) => [product.id, product.publicId]));
    return promotionCodes.map((code) => promotionCodeEntityToPromoOffer(
      code,
      code.promotion.products.getItems().map((product) => {
        const publicId = publicIdByProductId.get(product.productId);
        if (!publicId) throw new Error('Promotion product public id is required');
        return publicId;
      }),
    ));
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
        throw new OrderInventoryNotFoundError();
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
