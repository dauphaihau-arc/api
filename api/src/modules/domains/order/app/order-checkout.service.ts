import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MARKETPLACE_CURRENCIES } from '~/config/marketplace.config';
import {
  buildProductInventoryUpdatedSseEvent,
  PRODUCT_INVENTORY_UPDATED_SSE_EVENT,
} from '~/modules/domains/product/app/events/product-inventory-sse.event';
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
import { OrderCheckoutOutboxService } from './order-checkout-outbox.service';
import type {
  CheckoutActor,
  CreateOrderResult,
  ShippingAddressInput,
  ShopAdjustmentInput
} from './order.types';
import type { CartSnapshot } from '../../cart/app/cart.types';

@Injectable()
export class OrderCheckoutService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly couponPricingService: CouponPricingService,
    private readonly orderCheckoutOutboxService: OrderCheckoutOutboxService,
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
      isTempCart: boolean;
    }
  ): Promise<CreateOrderResult> {
    const currency = input.currency && MARKETPLACE_CURRENCIES.includes(input.currency as (typeof MARKETPLACE_CURRENCIES)[number])
      ? input.currency
      : 'USD';

    const pricedCart = await this.couponPricingService.priceCart({
      userId: actor.type === 'user' ? actor.userId : undefined,
      cart,
      shippingAddress: input.shippingAddress,
      shopAdjustments: input.shopAdjustments,
    });

    if (pricedCart.shops.length === 0) {
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

      for (const shop of pricedCart.shops) {
        const shopEntity = await entityManager.getRepository(ShopEntity).findOne({ id: shop.shopId });
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
          subtotal: shop.subtotal,
          totalShippingFee: shop.totalShippingFee,
          totalDiscount: shop.totalDiscount,
          total: shop.total,
          note: shop.note,
          promoCodes: shop.promoCoupons.map((coupon) => coupon.code),
          shippingAddress: {
            full_name: input.shippingAddress.fullName,
            address1: input.shippingAddress.address1,
            address2: input.shippingAddress.address2,
            city: input.shippingAddress.city,
            country: input.shippingAddress.country,
            state: input.shippingAddress.state,
            zip: input.shippingAddress.zip,
            phone: input.shippingAddress.phone,
          },
          shippingOriginCountries: shop.originCountries,
          shippingToCountry: input.shippingAddress.country,
          shippingEstimatedDelivery: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)),
          paymentDetails: {
            type: input.paymentType,
            cart_id: cartId,
            is_temp_cart: input.isTempCart,
          },
        });
        entityManager.persist(order);
        await entityManager.flush();

        for (const item of shop.items) {
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
            price: item.price,
            salePrice: item.effectiveUnitPrice < item.price ? item.effectiveUnitPrice : item.salePrice,
            percentCouponCode: item.autoSaleCoupon?.code,
            percentCouponPercent: item.autoSaleCoupon?.percentOff,
          });
          entityManager.persist(orderItem);
        }

        for (const coupon of shop.promoCoupons) {
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

        createdOrders.push(order);
      }

      if (input.paymentType === PaymentType.CASH) {
        if (input.isTempCart) {
          const tempCart = await entityManager.getConnection().execute(
            'delete from carts where id = ?',
            [cartId]
          );
          void tempCart;
        }
        else {
          await entityManager.getConnection().execute(
            'delete from cart_items where cart_id = ? and is_select_order = true',
            [cartId]
          );
          await entityManager.getConnection().execute(
            'delete from carts where id = ? and not exists (select 1 from cart_items where cart_items.cart_id = carts.id)',
            [cartId]
          );
        }
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
            lineItems: pricedCart.shops.flatMap((shop) =>
              shop.items.map((item) => ({
                name: item.title,
                imageUrl: item.imageUrl,
                unitAmount: item.effectiveUnitPrice,
                quantity: item.quantity,
              }))
            ),
            shippingAmount: pricedCart.totalShippingFee,
            discountAmount: pricedCart.totalDiscount,
            shippingAddress: {
              fullName: input.shippingAddress.fullName,
              address1: input.shippingAddress.address1,
              address2: input.shippingAddress.address2,
              city: input.shippingAddress.city,
              country: input.shippingAddress.country,
              state: input.shippingAddress.state,
              zip: input.shippingAddress.zip,
              phone: input.shippingAddress.phone,
            },
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
        })),
      };
    });

    const checkoutSessionResult = result.checkoutOutboxEventId
      ? await this.orderCheckoutOutboxService.processEventById(result.checkoutOutboxEventId)
      : undefined;

    for (const inventoryEvent of result.inventoryEvents) {
      this.eventEmitter.emit(PRODUCT_INVENTORY_UPDATED_SSE_EVENT, inventoryEvent);
    }

    return {
      checkoutPending: result.checkoutPending && !checkoutSessionResult?.url,
      checkoutSessionId: checkoutSessionResult?.id,
      checkoutSessionUrl: checkoutSessionResult?.url,
      orderShops: result.orderShops,
    };
  }
}
