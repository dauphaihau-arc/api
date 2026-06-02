import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { fromMinorUnits, toMinorUnits } from '~/common/utils/money';
import { MARKETPLACE_CURRENCIES } from '~/config/marketplace.config';
import {
  buildProductInventoryUpdatedSseEvent,
  PRODUCT_INVENTORY_UPDATED_SSE_EVENT,
} from '~/modules/domains/product/app/events/product-inventory-sse.event';
import { NotifyUserUseCase } from '~/modules/shared/notification/app/use-cases/notify-user/notify-user.use-case';
import type { CartSnapshot } from '../../cart/app/cart.types';
import { CurrentUserEntity } from '../../auth/infra/persistence/entities/current-user.entity';
import { CouponPricingService } from '../../coupon/app/coupon-pricing.service';
import { CouponUsageEntity } from '../../coupon/infra/persistence/entities/coupon-usage.entity';
import { ProductInventoryEntity } from '../../product/infra/persistence/entities/product-inventory.entity';
import { ProductEntity } from '../../product/infra/persistence/entities/product.entity';
import { ShopEntity } from '../../shop/infra/persistence/entities/shop.entity';
import { PaymentType } from '../domain/enums/payment-type.enum';
import { OrderShippingStatus } from '../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../domain/enums/order-status.enum';
import { OrderEntity } from '../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../infra/persistence/entities/order-item.entity';
import type { LoadedCheckoutQuote } from './load-checkout-quote.service';
import { OrderCheckoutOutboxService } from './order-checkout-outbox.service';
import {
  buildSellerOrderCreatedNotification,
  getSellerOrderNotificationRecipientId,
} from './seller-order-notification';
import type {
  CheckoutActor,
  CreateOrderResult,
  ShippingAddressInput,
  ShopAdjustmentInput,
} from './order.types';

@Injectable()
export class OrderCheckoutService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly couponPricingService: CouponPricingService,
    private readonly orderCheckoutOutboxService: OrderCheckoutOutboxService,
    private readonly notifyUserUseCase: NotifyUserUseCase,
    private readonly eventEmitter: EventEmitter2
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
    }
  ): Promise<CreateOrderResult> {
    const quote = input.quote;
    const currency = quote
      ? quote.checkoutCurrency
      : normalizeCurrency(input.currency);
    const pricedCart = quote
      ? undefined
      : await this.couponPricingService.priceCart({
        userId: actor.type === 'user' ? actor.userId : undefined,
        cart,
        shippingAddress: input.shippingAddress,
        shopAdjustments: input.shopAdjustments,
      });
    const pricedShops = quote?.shops ?? pricedCart?.shops ?? [];

    if (pricedShops.length === 0) {
      throw new BadRequestException('No selected cart items to order');
    }

    const result = await this.entityManager.transactional(async (entityManager) => {
      const inventoryRepository = entityManager.getRepository(ProductInventoryEntity);
      const orderRepository = entityManager.getRepository(OrderEntity);
      const orderItemRepository = entityManager.getRepository(OrderItemEntity);
      const usageRepository = entityManager.getRepository(CouponUsageEntity);
      const createdOrders: OrderEntity[] = [];
      const inventoryEvents: ReturnType<typeof buildProductInventoryUpdatedSseEvent>[] = [];
      let checkoutOutboxEventId: string | undefined;

      for (const shop of pricedShops) {
        const quoteShop = quote
          ? shop as LoadedCheckoutQuote['shops'][number]
          : undefined;
        const pricedShop = quote
          ? undefined
          : shop as NonNullable<typeof pricedCart>['shops'][number];
        const shopEntity = await entityManager.getRepository(ShopEntity).findOne(
          { id: shop.shopId },
          { populate: ['ownerUser'] }
        );
        if (!shopEntity) {
          throw new NotFoundException('Shop not found');
        }

        const order = orderRepository.create({
          ...(actor.type === 'user'
            ? { user: entityManager.getReference(CurrentUserEntity, actor.userId) }
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
          subtotal: quoteShop ? fromMinorUnits(quoteShop.subtotalMinor, currency) : pricedShop!.subtotal,
          subtotalMinor: quoteShop
            ? quoteShop.subtotalMinor
            : toMinorUnits(pricedShop!.subtotal, currency),
          totalShippingFee: quoteShop ? fromMinorUnits(quoteShop.shippingMinor, currency) : pricedShop!.totalShippingFee,
          shippingMinor: quoteShop
            ? quoteShop.shippingMinor
            : toMinorUnits(pricedShop!.totalShippingFee, currency),
          totalDiscount: quoteShop ? fromMinorUnits(quoteShop.discountMinor, currency) : pricedShop!.totalDiscount,
          discountMinor: quoteShop
            ? quoteShop.discountMinor
            : toMinorUnits(pricedShop!.totalDiscount, currency),
          total: quoteShop ? fromMinorUnits(quoteShop.totalMinor, currency) : pricedShop!.total,
          totalMinor: quoteShop
            ? quoteShop.totalMinor
            : toMinorUnits(pricedShop!.total, currency),
          note: shop.note,
          promoCodes: quoteShop
            ? quoteShop.promoCodes
            : pricedShop!.promoCoupons.map((coupon) => coupon.code),
          shippingAddress: toPersistedShippingAddress(input.shippingAddress),
          shippingOriginCountries: shop.originCountries,
          shippingToCountry: input.shippingAddress.country,
          shippingEstimatedDelivery: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)),
          paymentDetails: {
            type: input.paymentType,
            cart_id: cartId,
            is_temp_cart: input.isTempCart,
            ...(quote
              ? {
                quote_id: quote.id,
                quoted_inventory_ids: quote.items.map((item) => item.inventoryId),
              }
              : {}),
          },
        });
        entityManager.persist(order);
        await entityManager.flush();

        for (const item of shop.items) {
          const quoteItem = quote
            ? item as LoadedCheckoutQuote['items'][number]
            : undefined;
          const pricedItem = quote
            ? undefined
            : item as NonNullable<typeof pricedCart>['shops'][number]['items'][number];
          const inventory = await inventoryRepository.findOne(
            { id: item.inventoryId },
            { lockMode: LockMode.PESSIMISTIC_WRITE, populate: ['productVariant'] }
          );

          if (!inventory) {
            throw new NotFoundException('Inventory not found');
          }

          if (inventory.stock < item.quantity) {
            throw new BadRequestException(`Insufficient stock for ${item.title}`);
          }

          inventory.stock -= item.quantity;
          inventoryEvents.push(buildProductInventoryUpdatedSseEvent({
            productId: item.productId,
            inventoryId: inventory.id,
            stock: inventory.stock,
          }));

          const orderItem = orderItemRepository.create({
            order,
            product: entityManager.getReference(ProductEntity, item.productId),
            inventory,
            title: item.title,
            imageUrl: item.imageUrl,
            variantGroupName: item.variantGroupName,
            variantSubGroupName: item.variantSubGroupName,
            variantName: item.variantName,
            quantity: item.quantity,
            price: quoteItem
              ? fromMinorUnits(
                quoteItem.originalAmountMinor ?? quoteItem.unitPriceCheckoutMinor,
                currency
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
        }

        if (pricedShop) {
          for (const coupon of pricedShop.promoCoupons) {
            coupon.usesCount += 1;
            const usage = usageRepository.create({
              coupon,
              ...(actor.type === 'user'
                ? { user: entityManager.getReference(CurrentUserEntity, actor.userId) }
                : {}),
              orderId: order.id,
              code: coupon.code,
            });
            entityManager.persist(usage);
          }
        }

        createdOrders.push(order);
      }

      if (input.paymentType === PaymentType.CASH) {
        await this.clearCart(
          entityManager,
          cartId,
          input.isTempCart,
          quote?.items.map((item) => item.inventoryId)
        );
      }

      if (input.paymentType === PaymentType.CARD) {
        const outboxEvent = await this.orderCheckoutOutboxService.createCheckoutSessionRequestedEvent(
          entityManager,
          {
            userId: actor.type === 'user' ? actor.userId : undefined,
            customerEmail: actor.email,
            cartId,
            orderIds: createdOrders.map((order) => order.id),
            currency,
            lineItems: pricedShops.flatMap((shop) =>
              shop.items.map((item) => {
                const quoteItem = quote
                  ? item as LoadedCheckoutQuote['items'][number]
                  : undefined;
                const pricedItem = quote
                  ? undefined
                  : item as NonNullable<typeof pricedCart>['shops'][number]['items'][number];

                return {
                  name: item.title,
                  imageUrl: item.imageUrl,
                  unitAmountMinor: quoteItem
                    ? quoteItem.unitPriceCheckoutMinor
                    : toMinorUnits(pricedItem!.effectiveUnitPrice, currency),
                  quantity: item.quantity,
                };
              })
            ),
            shippingAmountMinor: quote
              ? quote.shippingMinor
              : toMinorUnits(pricedCart?.totalShippingFee ?? 0, currency),
            discountAmountMinor: quote
              ? quote.discountMinor
              : toMinorUnits(pricedCart?.totalDiscount ?? 0, currency),
            shippingAddress: input.shippingAddress,
          }
        );

        checkoutOutboxEventId = outboxEvent.id;
      }

      await entityManager.flush();

      return {
        checkoutPending: input.paymentType === PaymentType.CARD,
        checkoutOutboxEventId,
        inventoryEvents,
        orderShops: createdOrders.map((order) => ({
          id: order.id,
          shopId: order.shop.id,
          shopName: order.shop.shopName,
          shopSlug: order.shop.slug,
          ownerUserId: getSellerOrderNotificationRecipientId(order),
        })),
      };
    });

    const checkoutSessionResult = result.checkoutOutboxEventId
      ? await this.orderCheckoutOutboxService.processEventById(result.checkoutOutboxEventId)
      : undefined;

    for (const inventoryEvent of result.inventoryEvents) {
      this.eventEmitter.emit(PRODUCT_INVENTORY_UPDATED_SSE_EVENT, inventoryEvent);
    }

    for (const orderShop of result.orderShops) {
      if (!('ownerUserId' in orderShop) || typeof orderShop.ownerUserId !== 'string') {
        continue;
      }

      await this.notifyUserUseCase.execute(
        buildSellerOrderCreatedNotification(
          orderShop.ownerUserId,
          orderShop.id,
          orderShop.shopId
        )
      );
    }

    return {
      checkoutPending: result.checkoutPending && !checkoutSessionResult?.url,
      checkoutSessionId: checkoutSessionResult?.id,
      checkoutSessionUrl: checkoutSessionResult?.url,
      orderShops: result.orderShops,
    };
  }

  private async clearCart(
    entityManager: EntityManager,
    cartId: string,
    isTempCart: boolean,
    inventoryIds?: string[]
  ): Promise<void> {
    if (isTempCart) {
      await entityManager.getConnection().execute(
        'delete from carts where id = ?',
        [cartId]
      );
      return;
    }

    if (inventoryIds && inventoryIds.length > 0) {
      const placeholders = inventoryIds.map(() => '?').join(', ');
      await entityManager.getConnection().execute(
        `delete from cart_items where cart_id = ? and product_inventory_id in (${placeholders})`,
        [cartId, ...inventoryIds]
      );
    }
    else {
      await entityManager.getConnection().execute(
        'delete from cart_items where cart_id = ? and is_select_order = true',
        [cartId]
      );
    }

    await entityManager.getConnection().execute(
      'delete from carts where id = ? and not exists (select 1 from cart_items where cart_items.cart_id = carts.id)',
      [cartId]
    );
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
