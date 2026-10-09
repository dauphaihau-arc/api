import { Catch, Injectable } from '@nestjs/common';
import { DomainExceptionFilter } from '~/platform/filters/domain-exception.filter';
import { isShopAppError, mapShopAppErrorToHttpException } from './shop-http-error-mapper';

/** Maps Shop and Promotion-management domain errors to their HTTP contract. */
@Injectable()
@Catch()
export class ShopExceptionsFilter extends DomainExceptionFilter {
  protected mapDomainError(exception: unknown): Error | null {
    return isShopAppError(exception)
      ? mapShopAppErrorToHttpException(exception)
      : null;
  }
}
