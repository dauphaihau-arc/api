import { Catch, Injectable } from '@nestjs/common';
import { DomainExceptionFilter } from '~/platform/filters/domain-exception.filter';
import { OrderNotFoundError } from '~/domains/order/app/errors/order-app.error';
import { mapOrderAppErrorToHttpException } from '~/domains/order/api/rest/errors/order-http-error-mapper';
import { FinanceAppError } from '../../../app/errors/finance-app.error';
import { FinanceDomainError } from '../../../domain/errors/finance-domain.error';
import {
  mapFinanceAppErrorToHttpException,
  mapFinanceDomainErrorToHttpException,
  mapPayoutGatewayErrorToHttpException,
} from './finance-http-error-mapper';

/**
 * Maps the Finance domain and application errors that own an HTTP contract and
 * lets every other exception fall through to `GlobalExceptionFilter` — an
 * unmapped Finance error such as `UnbalancedJournalEntryError` stays a 500.
 *
 * A Finance read also resolves the Order it is asked about, so Ordering's
 * `OrderNotFoundError` is translated through Ordering's own mapper: a missing
 * Order and one that belongs to another shop answer the same 404.
 */
@Injectable()
@Catch()
export class FinanceExceptionsFilter extends DomainExceptionFilter {
  protected mapDomainError(exception: unknown): Error | null {
    const payoutGatewayError = mapPayoutGatewayErrorToHttpException(exception);

    if (payoutGatewayError) {
      return payoutGatewayError;
    }

    if (exception instanceof OrderNotFoundError) {
      return mapOrderAppErrorToHttpException(exception);
    }

    if (exception instanceof FinanceDomainError) {
      return mapFinanceDomainErrorToHttpException(exception);
    }

    if (exception instanceof FinanceAppError) {
      return mapFinanceAppErrorToHttpException(exception);
    }

    return null;
  }
}
