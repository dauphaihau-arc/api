import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  OrderInventoryNotFoundError,
  OrderNoItemsError,
  OrderShopNotFoundError,
} from '../../../app/errors/order-app.error';
import { mapOrderAppErrorToHttpException } from './order-http-error-mapper';
import { mapCheckoutAppErrorToHttpException } from '../../../../checkout/api/rest/errors/checkout-http-error-mapper';

describe('order checkout error transport', () => {
  it.each([
    [new OrderNoItemsError(), BadRequestException, 'ORDER_NO_ITEMS'],
    [new OrderShopNotFoundError(), NotFoundException, 'SHOP_NOT_FOUND'],
    [new OrderInventoryNotFoundError(), NotFoundException, 'PRODUCT_INVENTORY_NOT_FOUND'],
  ])('maps %p to its HTTP status and code', (error, ExceptionClass, code) => {
    for (const mapError of [
      mapOrderAppErrorToHttpException,
      mapCheckoutAppErrorToHttpException,
    ]) {
      const exception = mapError(error);

      expect(exception).toBeInstanceOf(ExceptionClass);
      expect(exception.getResponse()).toMatchObject({
        message: error.message,
        code,
      });
    }
  });
});
