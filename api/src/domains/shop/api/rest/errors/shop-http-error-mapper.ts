import type { HttpException } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ShopAppError } from '../../../app/errors/shop-app.error';
import {
  PromoCodeAlreadyExistsError,
  PromoCodeBenefitInvalidError,
  PromoCodeConditionInvalidError,
  PromoCodeEndAfterStartRequiredError,
  PromoCodeLocalTimeAmbiguousError,
  PromoCodeLocalTimeNonexistentError,
  PromoCodeNotFoundError,
  PromoCodeProductScopeInvalidError,
  PromoCodeScheduleInvalidError,
  PromoCodeStopNotAllowedError,
  PromoCodeTimeZoneInvalidError,
  SaleEndAfterStartRequiredError,
  SaleLocalTimeAmbiguousError,
  SaleLocalTimeNonexistentError,
  SaleNotFoundError,
  SaleProductScopeInvalidError,
  SaleScheduleInvalidError,
  SaleStopNotAllowedError,
  SaleTimeZoneInvalidError,
  ShopAccessDeniedError,
  ShopNameAlreadyTakenError,
  ShopNotFoundError,
  ShopSlugAlreadyTakenError,
  ShopSlugReservedError,
  ShopTimeZoneInvalidError,
  UserAlreadyOwnsShopError,
} from '../../../app/errors/shop-app.error';

/**
 * The machine-readable identity of a shop failure. A client branches and writes
 * its own copy from the code; the human `message` stays a fallback for codes a
 * client does not know yet, so the vocabulary can grow without breaking one.
 */
export type ShopHttpErrorCode =
  | 'SHOP_NAME_ALREADY_TAKEN'
  | 'SHOP_SLUG_ALREADY_TAKEN'
  | 'SHOP_SLUG_RESERVED'
  | 'USER_ALREADY_OWNS_SHOP'
  | 'SHOP_NOT_FOUND'
  | 'SHOP_ACCESS_DENIED'
  | 'SHOP_TIMEZONE_INVALID'
  | 'SALE_NOT_FOUND'
  | 'SALE_STOP_NOT_ALLOWED'
  | 'SALE_PRODUCT_SCOPE_INVALID'
  | 'SALE_SCHEDULE_INVALID'
  | 'SALE_TIMEZONE_INVALID'
  | 'SALE_END_AFTER_START_REQUIRED'
  | 'SALE_LOCAL_TIME_NONEXISTENT'
  | 'SALE_LOCAL_TIME_AMBIGUOUS'
  | 'PROMO_CODE_ALREADY_EXISTS'
  | 'PROMO_CODE_NOT_FOUND'
  | 'PROMO_CODE_STOP_NOT_ALLOWED'
  | 'PROMO_CODE_BENEFIT_INVALID'
  | 'PROMO_CODE_CONDITION_INVALID'
  | 'PROMO_CODE_PRODUCT_SCOPE_INVALID'
  | 'PROMO_CODE_SCHEDULE_INVALID'
  | 'PROMO_CODE_TIMEZONE_INVALID'
  | 'PROMO_CODE_END_AFTER_START_REQUIRED'
  | 'PROMO_CODE_LOCAL_TIME_NONEXISTENT'
  | 'PROMO_CODE_LOCAL_TIME_AMBIGUOUS'
  | 'SHOP_INVALID_INPUT';

export function isShopAppError(error: unknown): error is ShopAppError {
  return error instanceof ShopAppError;
}

export function mapShopAppErrorToHttpException(
  error: ShopAppError,
): HttpException {
  const payload = { message: error.message, code: getShopErrorCode(error) };

  if (
    error instanceof ShopNotFoundError
    || error instanceof SaleNotFoundError
    || error instanceof PromoCodeNotFoundError
  ) {
    return new NotFoundException(payload);
  }

  if (error instanceof ShopAccessDeniedError) {
    return new ForbiddenException(payload);
  }

  // A stop that the Sale's lifecycle state does not admit, a taken shop name,
  // or a Promo Code that already exists in the shop are conflicts with current
  // state, not malformed input.
  if (
    error instanceof ShopNameAlreadyTakenError
    || error instanceof ShopSlugAlreadyTakenError
    || error instanceof SaleStopNotAllowedError
    || error instanceof PromoCodeStopNotAllowedError
    || error instanceof PromoCodeAlreadyExistsError
  ) {
    return new ConflictException(payload);
  }

  // The remaining shop application failures are invalid input the use case
  // could not accept (e.g. a reversed schedule, foreign Product targets).
  return new BadRequestException(payload);
}

export function getShopErrorCode(error: ShopAppError): ShopHttpErrorCode {
  if (error instanceof ShopNameAlreadyTakenError) return 'SHOP_NAME_ALREADY_TAKEN';
  if (error instanceof ShopSlugAlreadyTakenError) return 'SHOP_SLUG_ALREADY_TAKEN';
  if (error instanceof ShopSlugReservedError) return 'SHOP_SLUG_RESERVED';
  if (error instanceof UserAlreadyOwnsShopError) return 'USER_ALREADY_OWNS_SHOP';
  if (error instanceof ShopNotFoundError) return 'SHOP_NOT_FOUND';
  if (error instanceof ShopAccessDeniedError) return 'SHOP_ACCESS_DENIED';
  if (error instanceof ShopTimeZoneInvalidError) return 'SHOP_TIMEZONE_INVALID';
  if (error instanceof SaleNotFoundError) return 'SALE_NOT_FOUND';
  if (error instanceof SaleStopNotAllowedError) return 'SALE_STOP_NOT_ALLOWED';
  if (error instanceof SaleProductScopeInvalidError) return 'SALE_PRODUCT_SCOPE_INVALID';
  if (error instanceof SaleScheduleInvalidError) return 'SALE_SCHEDULE_INVALID';
  if (error instanceof SaleTimeZoneInvalidError) return 'SALE_TIMEZONE_INVALID';
  if (error instanceof SaleEndAfterStartRequiredError) return 'SALE_END_AFTER_START_REQUIRED';
  if (error instanceof SaleLocalTimeNonexistentError) return 'SALE_LOCAL_TIME_NONEXISTENT';
  if (error instanceof SaleLocalTimeAmbiguousError) return 'SALE_LOCAL_TIME_AMBIGUOUS';
  if (error instanceof PromoCodeAlreadyExistsError) return 'PROMO_CODE_ALREADY_EXISTS';
  if (error instanceof PromoCodeNotFoundError) return 'PROMO_CODE_NOT_FOUND';
  if (error instanceof PromoCodeStopNotAllowedError) return 'PROMO_CODE_STOP_NOT_ALLOWED';
  if (error instanceof PromoCodeBenefitInvalidError) return 'PROMO_CODE_BENEFIT_INVALID';
  if (error instanceof PromoCodeConditionInvalidError) return 'PROMO_CODE_CONDITION_INVALID';
  if (error instanceof PromoCodeProductScopeInvalidError) return 'PROMO_CODE_PRODUCT_SCOPE_INVALID';
  if (error instanceof PromoCodeScheduleInvalidError) return 'PROMO_CODE_SCHEDULE_INVALID';
  if (error instanceof PromoCodeTimeZoneInvalidError) return 'PROMO_CODE_TIMEZONE_INVALID';
  if (error instanceof PromoCodeEndAfterStartRequiredError) {
    return 'PROMO_CODE_END_AFTER_START_REQUIRED';
  }
  if (error instanceof PromoCodeLocalTimeNonexistentError) {
    return 'PROMO_CODE_LOCAL_TIME_NONEXISTENT';
  }
  if (error instanceof PromoCodeLocalTimeAmbiguousError) return 'PROMO_CODE_LOCAL_TIME_AMBIGUOUS';

  return 'SHOP_INVALID_INPUT';
}
