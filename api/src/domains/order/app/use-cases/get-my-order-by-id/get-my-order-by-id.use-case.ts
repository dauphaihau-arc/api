import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { ProductReviewEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-review.entity';
import { OrderEntity } from '../../../infra/persistence/entities/order.entity';
import { OrderItemEntity } from '../../../infra/persistence/entities/order-item.entity';
import { OrderNotFoundError } from '../../errors/order-app.error';
import { buildScopedOrderIdentifierWhere } from '../../order-identifier';
import { getRequiredOrderNumber } from '../../order-number';
import {
  getOrderDiscountMajor,
  getOrderDiscountMinor,
  getOrderItemAmountMinor,
  getOrderItemOriginalAmountMinor,
  getOrderShippingMajor,
  getOrderShippingMinor,
  getOrderSubtotalMajor,
  getOrderSubtotalMinor,
  getOrderTotalMinor,
  getOrderTotalMajor,
} from '../../order-money';
import type { MyOrderDetail } from '../../order.types';

@Injectable()
export class GetMyOrderByIdUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly storageService: StorageService,
  ) {}

  async execute(actor: AuthenticatedUser, orderId: string): Promise<MyOrderDetail> {
    const entityManager = this.entityManager.fork();
    const order = await entityManager.getRepository(OrderEntity).findOne(
      buildScopedOrderIdentifierWhere(orderId, { user: actor.userId }),
      { populate: ['shop'] },
    );

    if (!order) {
      throw new OrderNotFoundError();
    }

    const items = await entityManager.getRepository(OrderItemEntity).find(
      { order: order.id },
      { populate: ['product', 'product.shop', 'inventory'] },
    );
    const reviewMap = await loadProductReviewMap(
      entityManager,
      actor.userId,
      Array.from(new Set(items.map((item) => item.product.id))),
      this.storageService,
    );

    return {
      id: order.id,
      orderNumber: getRequiredOrderNumber(order),
      shopId: order.shop.id,
      shopName: order.shop.shopName,
      shopSlug: order.shop.slug,
      currency: order.currency,
      customerEmail: order.customerEmail,
      paymentType: order.paymentType,
      status: order.status,
      products: items.map((item) => ({
        id: item.id,
        productId: item.product.id,
        slug: item.product.slug,
        shopSlug: item.product.shop.slug,
        title: item.title,
        imageUrl: item.imageUrl,
        imageReference: item.imageReference,
        quantity: item.quantity,
        amountMinor: getOrderItemAmountMinor(item, order.currency),
        originalAmountMinor: getOrderItemOriginalAmountMinor(item),
        currency: order.currency,
        sku: item.sku,
        selectedOptions: item.selectedOptions ?? [],
        percentCouponPercent: item.percentCouponPercent ?? null,
        myReview: reviewMap.get(item.product.id),
      })),
      promoCodes: order.promoCodes,
      shippingStatus: order.shippingStatus,
      shippingUpdatedAt: order.updatedAt,
      shippingToCountry: order.shippingToCountry,
      shippingFromCountries: order.shippingOriginCountries,
      shippingEstimatedDelivery: order.shippingEstimatedDelivery,
      trackingNumber: order.trackingNumber,
      shippingCarrier: order.shippingCarrier,
      shipmentNote: order.shipmentNote,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      canceledAt: order.canceledAt,
      cancelReason: order.cancelReason,
      customerSupportNote: order.customerSupportNote,
      cancelRequestedAt: order.cancelRequestedAt,
      refundedAt: order.refundedAt,
      paymentDetails: order.paymentDetails,
      subtotal: getOrderSubtotalMajor(order),
      subtotalMinor: getOrderSubtotalMinor(order),
      totalShippingFee: getOrderShippingMajor(order),
      shippingMinor: getOrderShippingMinor(order),
      totalDiscount: getOrderDiscountMajor(order),
      discountMinor: getOrderDiscountMinor(order),
      total: getOrderTotalMajor(order),
      totalMinor: getOrderTotalMinor(order),
      note: order.note,
      createdAt: order.createdAt,
      shippingAddress: {
        fullName: String((order.shippingAddress?.full_name ?? '')),
        address1: String((order.shippingAddress?.address1 ?? '')),
        ...(order.shippingAddress?.address2
          ? { address2: String(order.shippingAddress.address2) }
          : {}),
        city: String((order.shippingAddress?.city ?? '')),
        country: String((order.shippingAddress?.country ?? '')),
        state: String((order.shippingAddress?.state ?? '')),
        zip: String((order.shippingAddress?.zip ?? '')),
        ...(order.shippingAddress?.phone
          ? { phone: String(order.shippingAddress.phone) }
          : {}),
      },
    };
  }
}

async function loadProductReviewMap(
  entityManager: EntityManager,
  userId: string,
  productIds: string[],
  storageService: StorageService,
) {
  if (productIds.length === 0) {
    return new Map<string, NonNullable<MyOrderDetail['products'][number]['myReview']>>();
  }

  const reviews = await entityManager.getRepository(ProductReviewEntity).find(
    {
      user: userId,
      product: { $in: productIds },
    },
    {
      populate: ['images'],
      orderBy: {
        updatedAt: 'desc',
      },
    },
  );

  return new Map(reviews.map((review) => [
    review.product.id,
    {
      id: review.id,
      rating: review.rating,
      title: review.title,
      body: review.body,
      status: review.status,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
      images: review.images.getItems()
        .slice()
        .sort((left, right) => left.rank - right.rank)
        .map((image) => ({
          id: image.id,
          storageKey: image.storageKey,
          url: storageService.getPublicUrl(image.storageKey),
          sizeBytes: image.sizeBytes,
          rank: image.rank,
        })),
    },
  ]));
}
