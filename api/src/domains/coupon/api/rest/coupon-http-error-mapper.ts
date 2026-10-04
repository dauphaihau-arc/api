import type { HttpException } from '@nestjs/common';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { CouponAppError } from '../../app/errors/coupon-app.error';
import {
  CouponCodeNotApplicableError,
  CouponCodeNotFoundError,
  CouponCurrencyConversionUnavailableError,
  CouponSlotConflictError,
} from '../../app/errors/coupon-app.error';

export function isCouponAppError(error: unknown): error is CouponAppError {
  return error instanceof CouponCodeNotFoundError
    || error instanceof CouponCodeNotApplicableError
    || error instanceof CouponSlotConflictError
    || error instanceof CouponCurrencyConversionUnavailableError;
}

/**
 * Maps a coupon application failure to its response: a missing code is a 404,
 * everything else (not applicable, slot conflict, missing rate) is a 422 that
 * carries the domain message.
 */
export function mapCouponAppErrorToHttpException(error: CouponAppError): HttpException {
  if (error instanceof CouponCodeNotFoundError) {
    return new NotFoundException('Coupon code not found');
  }

  // The evaluator's reason travels with the rejection so the client can say why
  // precisely (exhausted, wrong products, minimum not met) instead of the
  // one-size message, which cannot tell them apart.
  if (error instanceof CouponCodeNotApplicableError && error.reason) {
    return new UnprocessableEntityException({
      message: error.message,
      reason: error.reason,
    });
  }

  return new UnprocessableEntityException(error.message);
}
