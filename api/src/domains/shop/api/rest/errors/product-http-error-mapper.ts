import type { HttpException } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ActorCannotCreateProductDraftError,
  CategoryNotFoundError,
  InvalidProductAttributeSelectionError,
  InvalidProductReviewImageError,
  InvalidProductVariantConfigurationError,
  ProductDraftIncompleteError,
  ProductNotFoundError,
  ProductOnHandVersionConflictError,
  ProductNotReadyToPublishError,
  ProductReviewNotEligibleError,
  ProductReviewOrderItemNotFoundError,
  ProductSlugAlreadyExistsError,
  ProductVersionConflictError,
  ProductConfigurationConflictError,
  PublishedProductReplacementRejectedError,
} from '../../../../product/app/errors/product-app.error';
import { toShopProductDetailResponse } from '../presenters/shop-product-detail.presenter';

/**
 * The public code for each Product configuration conflict, whose internal error
 * keeps its long-standing CamelCase discriminator.
 */
const PRODUCT_CONFLICT_PUBLIC_CODES: Record<
  ProductConfigurationConflictError['code'],
  string
> = {
  ProductSkuConflict: 'PRODUCT_SKU_CONFLICT',
  ProductReservationConflict: 'PRODUCT_RESERVATION_CONFLICT',
  ProductOnHandVersionConflict: 'PRODUCT_ON_HAND_VERSION_CONFLICT',
};

export function mapProductAppErrorToHttpException(
  error:
    | ActorCannotCreateProductDraftError
    | CategoryNotFoundError
    | ProductNotFoundError
    | ProductSlugAlreadyExistsError
    | ProductReviewOrderItemNotFoundError
    | InvalidProductVariantConfigurationError
    | InvalidProductAttributeSelectionError
    | ProductNotReadyToPublishError
    | ProductReviewNotEligibleError
    | InvalidProductReviewImageError
    | ProductDraftIncompleteError
    | ProductOnHandVersionConflictError
    | ProductVersionConflictError
    | ProductConfigurationConflictError
    | PublishedProductReplacementRejectedError,
): HttpException {
  if (error instanceof ProductConfigurationConflictError) {
    return new ConflictException({
      code: PRODUCT_CONFLICT_PUBLIC_CODES[error.code],
      message: error.message,
      details: {
        affected_ids: error.affectedIds,
        conflicts: error.skuConflicts.map(conflict => ({
          sku: conflict.sku,
          inventory_id: conflict.inventoryId,
          variant_id: conflict.variantId,
          client_ref: conflict.clientRef,
        })),
        current_product: toShopProductDetailResponse(error.currentProduct),
      },
    });
  }
  if (error instanceof ActorCannotCreateProductDraftError) {
    return new ForbiddenException({
      code: 'ACTOR_CANNOT_CREATE_PRODUCT_DRAFT',
      message: error.message,
    });
  }

  if (error instanceof CategoryNotFoundError) {
    return new NotFoundException({
      code: 'CATEGORY_NOT_FOUND',
      message: error.message,
    });
  }

  if (error instanceof ProductNotFoundError) {
    return new NotFoundException({
      code: 'PRODUCT_NOT_FOUND',
      message: 'Product was not found',
    });
  }

  if (error instanceof ProductSlugAlreadyExistsError) {
    return new ConflictException({
      code: 'PRODUCT_SLUG_ALREADY_EXISTS',
      message: error.message,
    });
  }

  if (error instanceof PublishedProductReplacementRejectedError) {
    return new ConflictException({
      code: 'PUBLISHED_PRODUCT_REPLACEMENT_REJECTED',
      message: error.message,
    });
  }

  if (error instanceof ProductVersionConflictError) {
    return new ConflictException({
      code: 'PRODUCT_VERSION_CONFLICT',
      message: error.message,
      details: {
        product_version: error.currentProduct.productVersion ?? 1,
        current_product: toShopProductDetailResponse(error.currentProduct),
      },
    });
  }

  if (error instanceof ProductOnHandVersionConflictError) {
    return new ConflictException({
      code: 'PRODUCT_ON_HAND_VERSION_CONFLICT',
      message: error.message,
      details: {
        inventory_id: error.currentInventory.id,
        on_hand_quantity: error.currentInventory.onHandQuantity ?? 0,
        reserved_quantity: error.currentInventory.reservedQuantity ?? 0,
        on_hand_version: error.currentInventory.onHandVersion ?? 1,
      },
    });
  }

  if (
    error instanceof ProductReviewOrderItemNotFoundError
  ) {
    return new NotFoundException({
      code: 'PRODUCT_REVIEW_ORDER_ITEM_NOT_FOUND',
      message: error.message,
    });
  }

  if (error instanceof InvalidProductVariantConfigurationError) {
    return new UnprocessableEntityException({
      code: 'INVALID_PRODUCT_VARIANT_CONFIGURATION',
      message: error.message,
    });
  }

  if (error instanceof InvalidProductAttributeSelectionError) {
    return new BadRequestException({
      code: 'INVALID_PRODUCT_ATTRIBUTE_SELECTION',
      message: error.message,
    });
  }

  if (error instanceof ProductNotReadyToPublishError) {
    return new BadRequestException({
      code: 'PRODUCT_NOT_READY_TO_PUBLISH',
      message: error.message,
    });
  }

  if (
    error instanceof ProductReviewNotEligibleError
  ) {
    return new BadRequestException({
      code: 'PRODUCT_REVIEW_NOT_ELIGIBLE',
      message: error.message,
    });
  }

  if (error instanceof InvalidProductReviewImageError) {
    return new BadRequestException({
      code: 'INVALID_PRODUCT_REVIEW_IMAGE',
      message: error.message,
    });
  }

  if (error instanceof ProductDraftIncompleteError) {
    return new UnprocessableEntityException({
      code: 'PRODUCT_DRAFT_INCOMPLETE',
      message: error.message.replaceAll(error.productId, error.productPublicId),
      details: {
        product_id: error.productPublicId,
        failed_step: error.failedStep,
      },
    });
  }

  return new BadRequestException({
    code: 'PRODUCT_REQUEST_INVALID',
    message: 'Bad product request',
  });
}
