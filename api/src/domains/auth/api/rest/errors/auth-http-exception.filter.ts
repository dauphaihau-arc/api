import { Catch, Injectable } from '@nestjs/common';
import { DomainExceptionFilter } from '~/platform/filters/domain-exception.filter';
import { isAuthAppError, mapAuthAppErrorToHttpException } from './auth-error-mapper';

/**
 * Maps Auth domain errors to their HTTP contract.
 *
 * Auth routes map their `Result` values through `mapAuthAppErrorToHttpException`
 * directly, so this filter only steps in when an auth error escapes as a thrown
 * exception.
 */
@Injectable()
@Catch()
export class AuthHttpExceptionFilter extends DomainExceptionFilter {
  protected mapDomainError(exception: unknown): Error | null {
    return isAuthAppError(exception)
      ? mapAuthAppErrorToHttpException(exception)
      : null;
  }
}
