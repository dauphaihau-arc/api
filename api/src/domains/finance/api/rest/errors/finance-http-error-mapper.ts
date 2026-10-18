import { BadRequestException } from '@nestjs/common';
import type { HttpException } from '@nestjs/common';
import { InvalidCommissionRateError } from '../../../domain/errors/finance-domain.error';
import type { FinanceDomainError } from '../../../domain/errors/finance-domain.error';

/**
 * Maps the Finance domain errors that own an HTTP contract, or `null` when the
 * error has none.
 *
 * `InvalidCommissionRateError` is the only one: a recorded rate must be an
 * integer number of basis points in `0..10000`. Every other Finance error (an
 * unbalanced Journal Entry is a server-side invariant breach) has no authored
 * contract and returns `null`, so it reaches `GlobalExceptionFilter` unchanged.
 */
export function mapFinanceDomainErrorToHttpException(
  error: FinanceDomainError,
): HttpException | null {
  if (error instanceof InvalidCommissionRateError) {
    return new BadRequestException({
      message: error.message,
      code: 'INVALID_COMMISSION_RATE',
    });
  }

  return null;
}
