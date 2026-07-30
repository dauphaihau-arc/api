import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import { appJobDeduplicationKey, appJobName } from '~/integrations/queue/app/app-job.types';
import type { Cache } from 'cache-manager';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { OrderItemEntity } from '~/domains/order/infra/persistence/entities/order-item.entity';
import {
  InvalidProductReviewImageError,
  ProductReviewEditLimitExceededError,
  ProductReviewNotEligibleError,
  ProductReviewOrderItemNotFoundError,
} from '../../errors/product-app.error';
import type { MyProductReview } from '../../product.types';
import { CatalogProductProjectorService } from '../../services/catalog-product-projector.service';
import { ProductImageVariantStatus } from '../../../domain/enums/product-image-variant-status.enum';
import { ProductReviewStatus } from '../../../domain/enums/product-review-status.enum';
import {
  isEligibleForProductReview,
  trimOptionalReviewText,
} from '../../product-review.helpers';
import { PRODUCT_REVIEW_MAX_IMAGES } from '../../product-review.constants';
import { ProductReviewEntity } from '../../../infra/persistence/mikro-orm/entities/product-review.entity';
import { ProductReviewImageEntity } from '../../../infra/persistence/mikro-orm/entities/product-review-image.entity';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { PendingReviewImageUploadService } from '../../pending-review-image-upload.service';
import {
  buildProductReviewEditLimitCacheKey,
  millisecondsUntilNextUtcDay,
} from '../../product-review.cache-keys';
import { ProductReviewAggregateRepository } from '../../ports/product-review-aggregate.repository';

const PRODUCT_REVIEW_MAX_EDITS_PER_DAY = 5;

export type UpsertMyProductReviewInput = {
  rating: number;
  title?: string;
  body?: string;
  imageKeys?: string[];
};

@Injectable()
export class UpsertMyProductReviewUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly catalogProductProjectorService: CatalogProductProjectorService,
    private readonly storageService: StorageService,
    private readonly pendingReviewImageUploadService: PendingReviewImageUploadService,
    private readonly jobDispatcher: JobDispatcher,
    private readonly productReviewAggregateRepository: ProductReviewAggregateRepository,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    orderItemId: string,
    input: UpsertMyProductReviewInput,
  ): Promise<MyProductReview> {
    const entityManager = this.entityManager.fork();
    const orderItem = await entityManager.getRepository(OrderItemEntity).findOne(
      {
        id: orderItemId,
        order: {
          user: actor.userId,
        },
      },
      {
        populate: ['order', 'product', 'product.shop'],
      },
    );

    if (!orderItem) {
      throw new ProductReviewOrderItemNotFoundError(orderItemId);
    }

    if (!isEligibleForProductReview(orderItem.order)) {
      throw new ProductReviewNotEligibleError(
        'This order item is not eligible for review yet',
      );
    }

    const reviewRepository = entityManager.getRepository(ProductReviewEntity);
    const existingReview = await reviewRepository.findOne({
      product: orderItem.product.id,
      user: actor.userId,
    }, {
      populate: ['images', 'images.variants'],
    });
    const previousImages = existingReview?.images.getItems() ?? [];
    const previousImageKeys = previousImages.map((image) => image.storageKey);
    const previousVariantKeys = previousImages.flatMap((image) =>
      image.variants.getItems().map((variant) => variant.storageKey),
    );
    const previousImageSizeBytesByKey = new Map(previousImages.map((image) => [image.storageKey, image.sizeBytes]));
    const normalizedImageKeys = normalizeReviewImageKeys(
      input.imageKeys ?? [],
      actor.userId,
      orderItem.id,
      previousImageKeys,
    );
    const review = existingReview ?? reviewRepository.create({
      product: orderItem.product,
      shop: orderItem.product.shop,
      user: actor.userId,
      order: orderItem.order,
      orderItem,
      rating: input.rating,
      status: ProductReviewStatus.PUBLISHED,
    });

    if (existingReview) {
      await this.assertEditLimitNotExceeded(actor.userId, orderItem.product.id);
    }

    review.product = orderItem.product;
    review.shop = orderItem.product.shop;
    review.order = orderItem.order;
    review.orderItem = orderItem;
    review.rating = input.rating;
    review.title = trimOptionalReviewText(input.title);
    review.body = trimOptionalReviewText(input.body);
    review.status = ProductReviewStatus.PUBLISHED;

    const pendingUploads = await Promise.all(
      normalizedImageKeys.map(async (storageKey) => ([
        storageKey,
        await this.pendingReviewImageUploadService.getPending(storageKey),
      ] as const)),
    );
    const pendingUploadsByKey = new Map(pendingUploads);

    if (previousImages.length > 0) {
      review.images.removeAll();
      await entityManager.flush();
    }

    normalizedImageKeys.forEach((storageKey, index) => {
      const pendingUpload = pendingUploadsByKey.get(storageKey);
      review.images.add(entityManager.create(ProductReviewImageEntity, {
        review,
        storageKey,
        sizeBytes: previousImageSizeBytesByKey.get(storageKey) ?? pendingUpload?.sizeBytes,
        rank: index + 1,
        variantStatus: ProductImageVariantStatus.PENDING,
      }));
    });

    await entityManager.persistAndFlush(review);
    await deleteRemovedImages(
      this.storageService,
      [...previousImageKeys, ...previousVariantKeys],
      normalizedImageKeys,
    );
    await clearPendingImages(this.pendingReviewImageUploadService, [
      ...previousImageKeys,
      ...normalizedImageKeys,
    ]);
    await dispatchReviewImageVariantJobs(this.jobDispatcher, review.images.getItems().map((image) => image.id));
    await this.productReviewAggregateRepository.recalculateForProduct(orderItem.product.id);
    await this.catalogProductProjectorService.projectProduct(orderItem.product.id);

    return {
      id: review.id,
      orderId: orderItem.order.id,
      orderItemId: orderItem.id,
      product: {
        id: orderItem.product.id,
        slug: orderItem.product.slug,
        title: orderItem.title,
        shopSlug: orderItem.product.shop.slug,
      },
      rating: review.rating,
      title: review.title,
      body: review.body,
      images: review.images.getItems()
        .slice()
        .sort((left, right) => left.rank - right.rank)
        .map((image) => ({
          id: image.id,
          storageKey: image.storageKey,
          url: this.storageService.getPublicUrl(image.storageKey),
          sizeBytes: image.sizeBytes,
          rank: image.rank,
          variantStatus: image.variantStatus,
          variantError: image.variantError,
          variantsGeneratedAt: image.variantsGeneratedAt,
          variants: image.variants.getItems().map((variant) => ({
            id: variant.id,
            variant: variant.variant,
            storageKey: variant.storageKey,
            url: this.storageService.getPublicUrl(variant.storageKey),
            width: variant.width,
            height: variant.height,
            format: variant.format,
          })),
        })),
      status: review.status,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }

  private async assertEditLimitNotExceeded(
    userId: string,
    productId: string,
  ): Promise<void> {
    const now = new Date();
    const cacheKey = buildProductReviewEditLimitCacheKey(userId, productId, now);
    const currentCount = Number(await this.cacheManager.get<number>(cacheKey) ?? 0);

    if (currentCount >= PRODUCT_REVIEW_MAX_EDITS_PER_DAY) {
      throw new ProductReviewEditLimitExceededError(PRODUCT_REVIEW_MAX_EDITS_PER_DAY);
    }

    await this.cacheManager.set(
      cacheKey,
      currentCount + 1,
      millisecondsUntilNextUtcDay(now),
    );
  }
}

function normalizeReviewImageKeys(
  keys: string[],
  userId: string,
  orderItemId: string,
  allowedExistingKeys: string[],
): string[] {
  const normalized = keys
    .map((key) => key.trim())
    .filter(Boolean);

  if (normalized.length > PRODUCT_REVIEW_MAX_IMAGES) {
    throw new InvalidProductReviewImageError(
      `A review can include at most ${PRODUCT_REVIEW_MAX_IMAGES} images`,
    );
  }

  const expectedSegment = `/users/${userId}/products/${orderItemId}/images/product-reviews/`;
  const allowedExistingKeySet = new Set(allowedExistingKeys);

  normalized.forEach((key) => {
    if (!key.includes(expectedSegment) && !allowedExistingKeySet.has(key)) {
      throw new InvalidProductReviewImageError(
        'Review image key is not valid for this order item',
      );
    }
  });

  return Array.from(new Set(normalized));
}

async function deleteRemovedImages(
  storageService: StorageService,
  previousImageKeys: string[],
  nextImageKeys: string[],
): Promise<void> {
  const nextKeys = new Set(nextImageKeys);
  const removedKeys = previousImageKeys.filter((key) => !nextKeys.has(key));

  await Promise.all(removedKeys.map((key) => storageService.deleteObject(key)));
}

async function clearPendingImages(
  pendingReviewImageUploadService: PendingReviewImageUploadService,
  imageKeys: string[],
): Promise<void> {
  const uniqueKeys = Array.from(new Set(imageKeys));
  await Promise.all(uniqueKeys.map((key) => pendingReviewImageUploadService.clearPending(key)));
}

async function dispatchReviewImageVariantJobs(
  jobDispatcher: JobDispatcher,
  reviewImageIds: string[],
): Promise<void> {
  const uniqueIds = Array.from(new Set(reviewImageIds));

  await Promise.all(uniqueIds.map((reviewImageId) =>
    jobDispatcher.dispatch(
      appJobName.generateReviewImageVariants,
      { reviewImageId },
      {
        deduplicationKey: appJobDeduplicationKey.generateReviewImageVariants(reviewImageId),
      },
    )));
}
