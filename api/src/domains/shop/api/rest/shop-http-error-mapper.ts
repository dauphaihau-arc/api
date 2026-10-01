import type { HttpException } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ShopAppError } from '../../app/errors/shop-app.error';
import {
  CouponNotFoundError,
  SaleNotFoundError,
  SaleStopNotAllowedError,
  ShopAccessDeniedError,
  ShopNameAlreadyTakenError,
  ShopNotFoundError,
  ShopSlugAlreadyTakenError,
  ShopSlugReservedError,
  UserAlreadyOwnsShopError,
} from '../../app/errors/shop-app.error';

export function isShopAppError(error: unknown): error is ShopAppError {
  return error instanceof ShopAppError;
}

export function mapShopAppErrorToHttpException(
  error: ShopAppError,
): HttpException {
  if (
    error instanceof ShopNotFoundError
    || error instanceof CouponNotFoundError
    || error instanceof SaleNotFoundError
  ) {
    return new NotFoundException(error.message);
  }

  if (error instanceof ShopAccessDeniedError) {
    return new ForbiddenException(error.message);
  }

  if (error instanceof ShopNameAlreadyTakenError) {
    return new ConflictException(error.message);
  }

  if (error instanceof ShopSlugAlreadyTakenError) {
    return new ConflictException(error.message);
  }

  // A stop that the Sale's lifecycle state does not admit is a conflict with
  // current state, not malformed input.
  if (error instanceof SaleStopNotAllowedError) {
    return new ConflictException(error.message);
  }

  if (error instanceof ShopSlugReservedError) {
    return new BadRequestException(error.message);
  }

  if (error instanceof UserAlreadyOwnsShopError) {
    return new BadRequestException(error.message);
  }

  // The remaining shop application failures are invalid input the use case
  // could not accept (e.g. a reversed coupon window, inconsistent usage limits).
  return new BadRequestException(error.message);
}
