import { Catch, Injectable } from '@nestjs/common';
import { DomainExceptionFilter } from '~/platform/filters/domain-exception.filter';
import { isFulfillmentError, mapFulfillmentErrorToHttpException } from './fulfillment-http-error-mapper';

/** Maps Fulfillment domain errors to their HTTP contract. */
@Injectable()
@Catch()
export class FulfillmentExceptionsFilter extends DomainExceptionFilter {
  protected mapDomainError(exception: unknown): Error | null {
    return isFulfillmentError(exception)
      ? mapFulfillmentErrorToHttpException(exception)
      : null;
  }
}
