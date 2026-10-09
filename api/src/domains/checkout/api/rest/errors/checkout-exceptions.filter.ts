import { Catch, Injectable } from '@nestjs/common';
import { DomainExceptionFilter } from '~/platform/filters/domain-exception.filter';
import { isPromotionAppError, mapPromotionAppErrorToHttpException } from '~/domains/promotion/api/rest/promotion-http-error-mapper';
import { isCheckoutAppError, mapCheckoutAppErrorToHttpException } from './checkout-http-error-mapper';

/**
 * Maps Checkout errors to their HTTP contract. Both checkout controllers read
 * carts, orders and quotes and apply Promotion codes, so the checkout mapper is
 * consulted first and the promotion mapper second, in the same order the
 * controllers' private helpers used.
 */
@Injectable()
@Catch()
export class CheckoutExceptionsFilter extends DomainExceptionFilter {
  protected mapDomainError(exception: unknown): Error | null {
    if (isCheckoutAppError(exception)) {
      return mapCheckoutAppErrorToHttpException(exception);
    }

    if (isPromotionAppError(exception)) {
      return mapPromotionAppErrorToHttpException(exception);
    }

    return null;
  }
}
