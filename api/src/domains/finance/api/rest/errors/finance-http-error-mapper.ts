import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
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
  PayoutAccountCountryUnsupportedError,
  PayoutAccountUnusableError,
  PayoutAmountExceedsAvailableError,
  PayoutConversionRateUnavailableError,
  PayoutPendingError,
  ProviderBalancePendingError,
  SettlementCurrencyBalanceNotZeroError,
  SettlementCurrencyChangePayoutPendingError,
  SettlementCurrencyChangeTooSoonError,
  SettlementCurrencyRateUnavailableError,
  SettlementCurrencyUnchangedError,
  SettlementCurrencyUnsupportedError,
} from '../../../app/errors/finance-app.error';
import type { FinanceAppError } from '../../../app/errors/finance-app.error';
import {
  PayoutAccountNotConnectedError,
  PayoutProviderNotConfiguredError,
} from '~/integrations/payment/app/ports/payout-gateway';
import { ConnectAccountConfigurationError } from '~/integrations/payment/app/ports/connect-gateway';

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
 * An unsupported Connect country is a plain refusal; an account whose
 * capabilities are not granted is a conflict the seller can act on; and a
 * deployment without Stripe answers 503 rather than failing startup.
 */
export function mapFinanceAppErrorToHttpException(
  error: FinanceAppError,
): HttpException | null {
  if (error instanceof PayoutAccountCountryUnsupportedError) {
    return new BadRequestException({
      message: error.message,
      code: 'PAYOUT_ACCOUNT_COUNTRY_UNSUPPORTED',
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

  if (error instanceof PayoutConversionRateUnavailableError) {
    return new ServiceUnavailableException({
      message: error.message,
      code: 'PAYOUT_CONVERSION_RATE_UNAVAILABLE',
    });
  }

  if (error instanceof ProviderBalancePendingError) {
    // The request is well-formed and the seller may retry later; it just cannot
    // be funded yet, so this is a conflict with the provider's current balance.
    return new ConflictException({
      message: error.message,
      code: 'PROVIDER_BALANCE_PENDING',
    });
  }

  return null;
}

/**
 * Maps the named failures the payout adapters raise. A transfer with no
 * connected account is a conflict with the shop's current destination; a
 * deployment without Stripe keys answers 503 rather than failing startup; and
 * a refusal of Arc's own Connect account configuration is an upstream bad
 * gateway (502), because the seller cannot fix it.
 */
export function mapPayoutGatewayErrorToHttpException(
  error: unknown,
): HttpException | null {
  if (error instanceof PayoutAccountNotConnectedError) {
    return new ConflictException({
      message: error.message,
      code: 'PAYOUT_ACCOUNT_NOT_CONNECTED',
    });
  }

  if (error instanceof ConnectAccountConfigurationError) {
    return new BadGatewayException({
      message: error.message,
      code: 'CONNECT_ACCOUNT_CONFIGURATION_ERROR',
    });
  }

  if (error instanceof PayoutProviderNotConfiguredError) {
    return new ServiceUnavailableException({
      message: error.message,
      code: 'PAYOUT_PROVIDER_NOT_CONFIGURED',
    });
  }

  return null;
}
