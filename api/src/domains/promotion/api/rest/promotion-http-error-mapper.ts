import type { HttpException } from '@nestjs/common';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PromoCodeIneligibleReason } from '../../domain/enums/promo-code-ineligible-reason.enum';
import type { PromotionAppError } from '../../app/errors/promotion-app.error';
import {
  PromotionCodeNotApplicableError,
  PromotionCodeNotFoundError,
  PromotionCurrencyConversionUnavailableError,
  PromotionSlotConflictError,
} from '../../app/errors/promotion-app.error';

export type PromotionHttpErrorCode =
  | 'PROMOTION_CODE_NOT_FOUND'
  | 'PROMOTION_CODE_NOT_APPLICABLE'
  | 'PROMOTION_SLOT_CONFLICT'
  | 'PROMOTION_CURRENCY_CONVERSION_UNAVAILABLE'
  | 'PROMOTION_NOT_STARTED'
  | 'PROMOTION_EXPIRED'
  | 'PROMOTION_USAGE_LIMIT_REACHED'
  | 'PROMOTION_USER_USAGE_LIMIT_REACHED'
  | 'PROMOTION_AUTHENTICATION_REQUIRED'
  | 'PROMOTION_PRODUCT_SCOPE_MISMATCH'
  | 'PROMOTION_MIN_ORDER_VALUE_NOT_MET'
  | 'PROMOTION_MIN_PRODUCTS_NOT_MET'
  | 'PROMOTION_ZERO_BENEFIT';

/**
 * The public code for each evaluator rejection reason. The apply-time HTTP
 * error carries the code and the human message; the raw reason string never
 * reaches the wire.
 */
const REASON_HTTP_ERROR_CODES: Record<PromoCodeIneligibleReason, PromotionHttpErrorCode> = {
  [PromoCodeIneligibleReason.NOT_STARTED]: 'PROMOTION_NOT_STARTED',
  [PromoCodeIneligibleReason.EXPIRED]: 'PROMOTION_EXPIRED',
  [PromoCodeIneligibleReason.USAGE_LIMIT_REACHED]: 'PROMOTION_USAGE_LIMIT_REACHED',
  [PromoCodeIneligibleReason.USER_USAGE_LIMIT_REACHED]: 'PROMOTION_USER_USAGE_LIMIT_REACHED',
  [PromoCodeIneligibleReason.AUTHENTICATION_REQUIRED]: 'PROMOTION_AUTHENTICATION_REQUIRED',
  [PromoCodeIneligibleReason.PRODUCT_SCOPE]: 'PROMOTION_PRODUCT_SCOPE_MISMATCH',
  [PromoCodeIneligibleReason.MIN_ORDER_VALUE]: 'PROMOTION_MIN_ORDER_VALUE_NOT_MET',
  [PromoCodeIneligibleReason.MIN_PRODUCTS]: 'PROMOTION_MIN_PRODUCTS_NOT_MET',
  [PromoCodeIneligibleReason.ZERO_BENEFIT]: 'PROMOTION_ZERO_BENEFIT',
};

export function isPromotionAppError(error: unknown): error is PromotionAppError {
  return error instanceof PromotionCodeNotFoundError
    || error instanceof PromotionCodeNotApplicableError
    || error instanceof PromotionSlotConflictError
    || error instanceof PromotionCurrencyConversionUnavailableError;
}

/**
 * Maps a promotion application failure to its response: a missing code is a
 * 404, everything else (not applicable, slot conflict, missing rate) is a 422.
 * The evaluator's rejection reason becomes an explicit code so a client renders
 * its own precise copy; the raw reason string is not exposed.
 */
export function mapPromotionAppErrorToHttpException(error: PromotionAppError): HttpException {
  if (error instanceof PromotionCodeNotFoundError) {
    return new NotFoundException({
      code: 'PROMOTION_CODE_NOT_FOUND',
      message: 'Promotion code not found',
    });
  }

  if (error instanceof PromotionCodeNotApplicableError) {
    return new UnprocessableEntityException({
      code: error.reason
        ? REASON_HTTP_ERROR_CODES[error.reason]
        : 'PROMOTION_CODE_NOT_APPLICABLE',
      message: error.message,
    });
  }

  if (error instanceof PromotionSlotConflictError) {
    return new UnprocessableEntityException({
      code: 'PROMOTION_SLOT_CONFLICT',
      message: error.message,
    });
  }

  return new UnprocessableEntityException({
    code: 'PROMOTION_CURRENCY_CONVERSION_UNAVAILABLE',
    message: error.message,
    details: {
      promotion_currency: error.promotionCurrency,
      checkout_currency: error.checkoutCurrency,
    },
  });
}
