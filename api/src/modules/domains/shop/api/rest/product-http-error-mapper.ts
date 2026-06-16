import type { HttpException } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import type { ProductAppError } from '../../../product/app/errors/product-app.error';
import {
  ActorCannotCreateProductDraftError,
  CategoryNotFoundError,
  InvalidProductAttributeSelectionError,
  InvalidProductVariantConfigurationError,
  ProductDraftIncompleteError,
  ProductNotFoundError,
  ProductNotReadyToPublishError,
  ProductSlugAlreadyExistsError
} from '../../../product/app/errors/product-app.error';

export function mapProductAppErrorToHttpException(
  error: ProductAppError
): HttpException {
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

  if (error instanceof InvalidProductVariantConfigurationError) {
    return new BadRequestException(error.message);
  }

  if (error instanceof InvalidProductAttributeSelectionError) {
    return new BadRequestException(error.message);
  }

  if (error instanceof ProductNotReadyToPublishError) {
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

  return new BadRequestException(error.message);
}
