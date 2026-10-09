import { Catch, Injectable, NotFoundException } from '@nestjs/common';
import { DomainExceptionFilter } from '~/platform/filters/domain-exception.filter';
import { isPromotionAppError, mapPromotionAppErrorToHttpException } from '~/domains/promotion/api/rest/promotion-http-error-mapper';
import { CartAppError, CartNotFoundError } from '../../../app/errors/cart-app.error';
import { mapCartAppErrorToHttpException } from './cart-http-error-mapper';

/**
 * Maps Cart domain errors to their HTTP contract. A missing cart keeps its
 * route-specific `Cart not found` body rather than the mapper's
 * `CART_NOT_FOUND` payload, because the cart routes already answer that way.
 */
@Injectable()
@Catch()
export class CartExceptionsFilter extends DomainExceptionFilter {
  protected mapDomainError(exception: unknown): Error | null {
    if (exception instanceof CartNotFoundError) {
      return new NotFoundException('Cart not found');
    }

    if (exception instanceof CartAppError) {
      return mapCartAppErrorToHttpException(exception);
    }

    if (isPromotionAppError(exception)) {
      return mapPromotionAppErrorToHttpException(exception);
    }

    return null;
  }
}
