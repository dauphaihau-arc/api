import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { HttpException } from '@nestjs/common';
import {
  InvalidCommissionRateError,
  PayoutAccountInvalidError,
  PayoutAmountNotPositiveError,
} from '../../../domain/errors/finance-domain.error';
import type { FinanceDomainError } from '../../../domain/errors/finance-domain.error';
import {
  AutoPayoutIneligibleError,
  ManualPayoutAlreadyUsedError,
  NoPayableAmountError,
  PayoutAccountCurrencyMismatchError,
  PayoutAccountNotFoundError,
  PayoutAccountUnusableError,
  PayoutAmountExceedsAvailableError,
  PayoutPendingError,
  SettlementCurrencyBalanceNotZeroError,
  SettlementCurrencyChangePayoutPendingError,
  SettlementCurrencyChangeTooSoonError,
  SettlementCurrencyRateUnavailableError,
  SettlementCurrencyUnchangedError,
  SettlementCurrencyUnsupportedError,
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

  if (error instanceof PayoutAmountNotPositiveError) {
    return new BadRequestException({
      message: error.message,
      code: 'PAYOUT_AMOUNT_NOT_POSITIVE',
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

  if (error instanceof AutoPayoutIneligibleError) {
    return new ConflictException({
      message: error.message,
      code: 'AUTO_PAYOUT_NOT_ELIGIBLE',
    });
  }

  if (error instanceof PayoutAccountUnusableError) {
    return new BadRequestException({
      message: error.message,
      code: 'PAYOUT_ACCOUNT_UNUSABLE',
    });
  }

  if (error instanceof PayoutAmountExceedsAvailableError) {
    return new BadRequestException({
      message: error.message,
      code: 'PAYOUT_AMOUNT_EXCEEDS_AVAILABLE',
    });
  }

  if (error instanceof NoPayableAmountError) {
    return new BadRequestException({
      message: error.message,
      code: 'NO_PAYABLE_AMOUNT',
    });
  }

  if (error instanceof ManualPayoutAlreadyUsedError) {
    return new ConflictException({
      message: error.message,
      code: 'MANUAL_PAYOUT_ALREADY_USED',
    });
  }

  if (error instanceof PayoutPendingError) {
    return new ConflictException({
      message: error.message,
      code: 'PAYOUT_PENDING',
    });
  }

  if (error instanceof SettlementCurrencyUnsupportedError) {
    return new BadRequestException({
      message: error.message,
      code: 'SETTLEMENT_CURRENCY_UNSUPPORTED',
    });
  }

  if (error instanceof SettlementCurrencyUnchangedError) {
    return new BadRequestException({
      message: error.message,
      code: 'SETTLEMENT_CURRENCY_UNCHANGED',
    });
  }

  if (error instanceof SettlementCurrencyBalanceNotZeroError) {
    return new ConflictException({
      message: error.message,
      code: 'SETTLEMENT_CURRENCY_BALANCE_NOT_ZERO',
    });
  }

  if (error instanceof SettlementCurrencyChangePayoutPendingError) {
    return new ConflictException({
      message: error.message,
      code: 'SETTLEMENT_CURRENCY_PAYOUT_PENDING',
    });
  }

  if (error instanceof SettlementCurrencyChangeTooSoonError) {
    return new ConflictException({
      message: error.message,
      code: 'SETTLEMENT_CURRENCY_CHANGE_TOO_SOON',
    });
  }

  if (error instanceof SettlementCurrencyRateUnavailableError) {
    return new ServiceUnavailableException({
      message: error.message,
      code: 'SETTLEMENT_CURRENCY_RATE_UNAVAILABLE',
    });
  }

  return null;
}
