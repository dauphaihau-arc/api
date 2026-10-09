import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ShopAccessDeniedError,
  ShopNameAlreadyTakenError,
  ShopNotFoundError,
} from '../../../app/errors/shop-app.error';
import { isShopAppError, mapShopAppErrorToHttpException } from './shop-http-error-mapper';

describe('mapShopAppErrorToHttpException', () => {
  it.each([
    [new ShopNotFoundError(), NotFoundException, 'Shop not found'],
    [new ShopAccessDeniedError(), ForbiddenException, 'You do not own this shop'],
    [new ShopNameAlreadyTakenError(), ConflictException, 'Shop name is already taken'],
  ])('maps the shop application error to its HTTP response', (error, ExceptionClass, message) => {
    const exception = mapShopAppErrorToHttpException(error);

    expect(exception).toBeInstanceOf(ExceptionClass);
    expect(exception.message).toBe(message);
  });

  it('recognises shop application errors and rejects everything else', () => {
    expect(isShopAppError(new ShopNotFoundError())).toBe(true);
    expect(isShopAppError(new Error('unrelated'))).toBe(false);
  });
});
