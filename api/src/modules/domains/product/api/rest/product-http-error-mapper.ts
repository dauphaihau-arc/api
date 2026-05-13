import type { HttpException } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common';
import {
  ActorCannotCreateProductDraftError,
  CategoryNotFoundError,
  InvalidProductAttributeSelectionError,
  InvalidProductVariantConfigurationError,
  ProductAppError,
  ProductNotFoundError,
  ProductNotReadyToPublishError,
  ProductSlugAlreadyExistsError
} from '../../app/errors/product-app.error';

export function isProductAppError(error: unknown): error is ProductAppError {
  return error instanceof ProductAppError;
}

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

  return new BadRequestException(error.message);
}
