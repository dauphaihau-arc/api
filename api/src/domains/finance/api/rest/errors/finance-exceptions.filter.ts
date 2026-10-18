import { Catch, Injectable } from '@nestjs/common';
import { DomainExceptionFilter } from '~/platform/filters/domain-exception.filter';
import { FinanceDomainError } from '../../../domain/errors/finance-domain.error';
import { mapFinanceDomainErrorToHttpException } from './finance-http-error-mapper';

/**
 * Maps the Finance domain errors that own an HTTP contract and lets every other
 * exception fall through to `GlobalExceptionFilter` — an unmapped Finance error
 * such as `UnbalancedJournalEntryError` stays a 500.
 */
@Injectable()
@Catch()
export class FinanceExceptionsFilter extends DomainExceptionFilter {
  protected mapDomainError(exception: unknown): Error | null {
    return exception instanceof FinanceDomainError
      ? mapFinanceDomainErrorToHttpException(exception)
      : null;
  }
}
