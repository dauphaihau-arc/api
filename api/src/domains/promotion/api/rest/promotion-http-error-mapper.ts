import type { HttpException } from '@nestjs/common';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { PromotionAppError } from '../../app/errors/promotion-app.error';
import {
  PromotionCodeNotApplicableError,
  PromotionCodeNotFoundError,
  PromotionCurrencyConversionUnavailableError,
  PromotionSlotConflictError,
} from '../../app/errors/promotion-app.error';

export function isPromotionAppError(error: unknown): error is PromotionAppError {
  return error instanceof PromotionCodeNotFoundError
    || error instanceof PromotionCodeNotApplicableError
    || error instanceof PromotionSlotConflictError
    || error instanceof PromotionCurrencyConversionUnavailableError;
}

/**
 * Maps a promotion application failure to its response: a missing code is a
 * 404, everything else (not applicable, slot conflict, missing rate) is a 422
 * that carries the domain message.
 */
export function mapPromotionAppErrorToHttpException(error: PromotionAppError): HttpException {
  if (error instanceof PromotionCodeNotFoundError) {
    return new NotFoundException('Promotion code not found');
  }

  // The evaluator's reason travels with the rejection so the client can say why
  // precisely (exhausted, wrong products, minimum not met) instead of the
  // one-size message, which cannot tell them apart.
  if (error instanceof PromotionCodeNotApplicableError && error.reason) {
    return new UnprocessableEntityException({
      message: error.message,
      reason: error.reason,
    });
  }

  return new UnprocessableEntityException(error.message);
}
