import { Catch, Injectable } from '@nestjs/common';
import { DomainExceptionFilter } from '~/platform/filters/domain-exception.filter';
import { isOrderAppError, mapOrderAppErrorToHttpException } from './order-http-error-mapper';

/** Maps Order domain errors to their HTTP contract. */
@Injectable()
@Catch()
export class OrderExceptionsFilter extends DomainExceptionFilter {
  protected mapDomainError(exception: unknown): Error | null {
    return isOrderAppError(exception)
      ? mapOrderAppErrorToHttpException(exception)
      : null;
  }
}
