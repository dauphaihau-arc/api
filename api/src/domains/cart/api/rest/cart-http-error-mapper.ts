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

type CartHttpErrorCode =
  | 'CART_NOT_FOUND'
  | 'CART_ITEM_NOT_FOUND'
  | 'PRODUCT_INVENTORY_NOT_FOUND'
  | 'CART_QUANTITY_EXCEEDS_STOCK'
  | 'PRODUCT_UNAVAILABLE_FOR_CART';

export function mapCartAppErrorToHttpException(
  error: CartAppError,
): HttpException {
  if (
    error instanceof CartNotFoundError
    || error instanceof CartItemNotFoundError
    || error instanceof ProductInventoryNotFoundError
  ) {
    return new NotFoundException(buildCartErrorPayload(error));
  }

  if (error instanceof CartQuantityExceedsStockError) {
    return new BadRequestException(buildCartErrorPayload(error));
  }

  if (error instanceof ProductUnavailableForCartError) {
    return new UnprocessableEntityException(buildCartErrorPayload(error));
  }

  return new BadRequestException(buildCartErrorPayload(error));
}

function buildCartErrorPayload(error: CartAppError): {
  message: string;
  code: CartHttpErrorCode;
} {
  return {
    message: error.message,
    code: getCartErrorCode(error),
  };
}

function getCartErrorCode(error: CartAppError): CartHttpErrorCode {
  if (error instanceof CartNotFoundError) {
    return 'CART_NOT_FOUND';
  }
  if (error instanceof CartItemNotFoundError) {
    return 'CART_ITEM_NOT_FOUND';
  }
  if (error instanceof ProductInventoryNotFoundError) {
    return 'PRODUCT_INVENTORY_NOT_FOUND';
  }
  if (error instanceof CartQuantityExceedsStockError) {
    return 'CART_QUANTITY_EXCEEDS_STOCK';
  }
  return 'PRODUCT_UNAVAILABLE_FOR_CART';
}
