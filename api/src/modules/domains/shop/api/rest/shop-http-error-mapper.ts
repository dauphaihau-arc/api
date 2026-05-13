import type { HttpException } from '@nestjs/common';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { ShopAppError } from '../../app/errors/shop-app.error';
import {
  ShopNameAlreadyTakenError,
  UserAlreadyOwnsShopError
} from '../../app/errors/shop-app.error';

export function mapShopAppErrorToHttpException(
  error: ShopAppError
): HttpException {
  if (error instanceof ShopNameAlreadyTakenError) {
    return new ConflictException(error.message);
  }

  if (error instanceof UserAlreadyOwnsShopError) {
    return new BadRequestException(error.message);
  }

  return new BadRequestException(error.message);
}
