import type { HttpException } from '@nestjs/common';
import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { CartAppError } from '../../app/errors/cart-app.error';
import {
  CartItemNotFoundError,
  CartNotFoundError,
  CartQuantityExceedsStockError,
  ProductInventoryNotFoundError,
  ProductUnavailableForCartError,
} from '../../app/errors/cart-app.error';

export function mapCartAppErrorToHttpException(
  error: CartAppError,
): HttpException {
  if (
    error instanceof CartNotFoundError
    || error instanceof CartItemNotFoundError
    || error instanceof ProductInventoryNotFoundError
  ) {
    return new NotFoundException(error.message);
  }

  if (error instanceof CartQuantityExceedsStockError) {
    return new BadRequestException(error.message);
  }

  if (error instanceof ProductUnavailableForCartError) {
    return new UnprocessableEntityException(error.message);
  }

  return new BadRequestException(error.message);
}
