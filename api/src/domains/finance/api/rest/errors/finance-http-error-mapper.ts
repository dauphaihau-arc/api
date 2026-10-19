import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { HttpException } from '@nestjs/common';
import {
  InvalidCommissionRateError,
  PayoutAccountInvalidError,
} from '../../../domain/errors/finance-domain.error';
import type { FinanceDomainError } from '../../../domain/errors/finance-domain.error';
import {
  PayoutAccountCurrencyMismatchError,
  PayoutAccountNotFoundError,
} from '../../../app/errors/finance-app.error';
import type { FinanceAppError } from '../../../app/errors/finance-app.error';

/**
 * Maps the Finance domain errors that own an HTTP contract, or `null` when the
 * error has none.
 *
 * `InvalidCommissionRateError` and `PayoutAccountInvalidError` are the two: a
 * recorded rate must be an integer number of basis points in `0..10000`, and a
 * Payout Account must describe a destination that can be paid into. Every other
 * Finance error (an unbalanced Journal Entry is a server-side invariant breach)
 * has no authored contract and returns `null`, so it reaches
 * `GlobalExceptionFilter` unchanged.
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

  if (error instanceof PayoutAccountInvalidError) {
    return new BadRequestException({
      message: error.message,
      code: 'PAYOUT_ACCOUNT_INVALID',
    });
  }

  return null;
}

/**
 * Maps the Finance application errors that own an HTTP contract, or `null` when
 * the error has none.
 *
 * `PayoutAccountCurrencyMismatchError` and `PayoutAccountNotFoundError` are the
 * two: an active Payout Account recorded in a currency the shop no longer
 * settles in is a caller-visible conflict with the shop's current Settlement
 * Currency, and verifying a shop that has no Payout Account is a missing
 * resource.
 */
export function mapFinanceAppErrorToHttpException(
  error: FinanceAppError,
): HttpException | null {
  if (error instanceof PayoutAccountCurrencyMismatchError) {
    return new BadRequestException({
      message: error.message,
      code: 'PAYOUT_ACCOUNT_CURRENCY_MISMATCH',
    });
  }

  if (error instanceof PayoutAccountNotFoundError) {
    return new NotFoundException({
      message: error.message,
      code: 'PAYOUT_ACCOUNT_NOT_FOUND',
    });
  }

  return null;
}
