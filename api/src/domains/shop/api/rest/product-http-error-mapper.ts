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
} from '../../../product/app/errors/product-app.error';
import { toShopProductDetailResponse } from './shop-product-detail.presenter';

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
      code: error.code,
      affected_ids: error.affectedIds,
      conflicts: error.skuConflicts.map(conflict => ({
        sku: conflict.sku,
        inventory_id: conflict.inventoryId,
        variant_id: conflict.variantId,
        client_ref: conflict.clientRef,
      })),
      current_product: toShopProductDetailResponse(error.currentProduct),
    });
  }
  if (error instanceof ActorCannotCreateProductDraftError) {
    return new ForbiddenException(error.message);
  }

  if (error instanceof CategoryNotFoundError) {
    return new NotFoundException(error.message);
  }

  if (error instanceof ProductNotFoundError) {
    return new NotFoundException(error.message);
  }

  if (error instanceof ProductSlugAlreadyExistsError) {
    return new ConflictException(error.message);
  }

  if (error instanceof PublishedProductReplacementRejectedError) {
    return new ConflictException(error.message);
  }

  if (error instanceof ProductVersionConflictError) {
    return new ConflictException({
      error: 'Conflict',
      message: error.message,
      code: error.code,
      product_version: error.currentProduct.productVersion ?? 1,
      current_product: toShopProductDetailResponse(error.currentProduct),
    });
  }

  if (error instanceof ProductOnHandVersionConflictError) {
    return new ConflictException({
      error: 'Conflict',
      message: error.message,
      code: error.code,
      inventory_id: error.currentInventory.id,
      on_hand_quantity: error.currentInventory.onHandQuantity ?? 0,
      reserved_quantity: error.currentInventory.reservedQuantity ?? 0,
      on_hand_version: error.currentInventory.onHandVersion ?? 1,
    });
  }

  if (
    error instanceof ProductReviewOrderItemNotFoundError
  ) {
    return new NotFoundException(error.message);
  }

  if (error instanceof InvalidProductVariantConfigurationError) {
    return new UnprocessableEntityException({ code: error.name, message: error.message });
  }

  if (error instanceof InvalidProductAttributeSelectionError) {
    return new BadRequestException(error.message);
  }

  if (error instanceof ProductNotReadyToPublishError) {
    return new BadRequestException(error.message);
  }

  if (
    error instanceof ProductReviewNotEligibleError
    || error instanceof InvalidProductReviewImageError
  ) {
    return new BadRequestException(error.message);
  }

  if (error instanceof ProductDraftIncompleteError) {
    return new UnprocessableEntityException({
      error: 'Unprocessable Entity',
      message: error.message,
      code: error.code,
      product_id: error.productId,
      failed_step: error.failedStep,
    });
  }

  return new BadRequestException('Bad product request');
}
