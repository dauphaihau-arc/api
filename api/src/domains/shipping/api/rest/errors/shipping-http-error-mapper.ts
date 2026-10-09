import type { HttpException } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  InvalidShippingProfileError,
  ShippingProfileArchivedError,
  ShippingProfileInUseError,
  ShippingProfileNameTakenError,
  ShippingProfileNotCheckoutReadyError,
  ShippingProfileNotFoundError,
  ShippingProfileReadinessRequiredError,
  ShippingProfileVersionConflictError,
} from '../../../app/errors/shipping-app.error';

/** Stable UPPER_SNAKE_CASE public codes for shipping-profile failures. */
type ShippingHttpErrorCode =
  | 'SHIPPING_PROFILE_NOT_FOUND'
  | 'SHIPPING_PROFILE_REQUEST_INVALID'
  | 'SHIPPING_PROFILE_NOT_CHECKOUT_READY'
  | 'SHIPPING_PROFILE_NAME_TAKEN'
  | 'SHIPPING_PROFILE_ARCHIVED'
  | 'SHIPPING_PROFILE_READINESS_REQUIRED'
  | 'SHIPPING_PROFILE_IN_USE'
  | 'SHIPPING_PROFILE_VERSION_CONFLICT'
  | 'SHIPPING_PROFILE_INVALID';

export function mapShippingAppErrorToHttpException(
  error:
    | InvalidShippingProfileError
    | ShippingProfileArchivedError
    | ShippingProfileInUseError
    | ShippingProfileNameTakenError
    | ShippingProfileNotCheckoutReadyError
    | ShippingProfileNotFoundError
    | ShippingProfileReadinessRequiredError
    | ShippingProfileVersionConflictError,
): HttpException {
  if (error instanceof ShippingProfileNotFoundError) {
    return new NotFoundException({
      code: 'SHIPPING_PROFILE_NOT_FOUND' satisfies ShippingHttpErrorCode,
      message: error.message,
    });
  }

  if (error instanceof ShippingProfileNotCheckoutReadyError) {
    return new ConflictException({
      code: 'SHIPPING_PROFILE_NOT_CHECKOUT_READY' satisfies ShippingHttpErrorCode,
      message: error.message,
    });
  }

  if (error instanceof ShippingProfileNameTakenError) {
    return new ConflictException({
      code: 'SHIPPING_PROFILE_NAME_TAKEN' satisfies ShippingHttpErrorCode,
      message: error.message,
    });
  }

  if (error instanceof ShippingProfileArchivedError) {
    return new ConflictException({
      code: 'SHIPPING_PROFILE_ARCHIVED' satisfies ShippingHttpErrorCode,
      message: error.message,
    });
  }

  if (error instanceof ShippingProfileReadinessRequiredError) {
    return new ConflictException({
      code: 'SHIPPING_PROFILE_READINESS_REQUIRED' satisfies ShippingHttpErrorCode,
      message: error.message,
      details: {
        published_product_count: error.publishedProductCount,
      },
    });
  }

  if (error instanceof ShippingProfileInUseError) {
    return new ConflictException({
      code: 'SHIPPING_PROFILE_IN_USE' satisfies ShippingHttpErrorCode,
      message: error.message,
      details: {
        assigned_product_count: error.assignedProductCount,
      },
    });
  }

  if (error instanceof ShippingProfileVersionConflictError) {
    return new ConflictException({
      code: 'SHIPPING_PROFILE_VERSION_CONFLICT' satisfies ShippingHttpErrorCode,
      message: error.message,
      details: {
        version: error.currentProfile.version,
      },
    });
  }

  if (error instanceof InvalidShippingProfileError) {
    return new UnprocessableEntityException({
      code: 'SHIPPING_PROFILE_INVALID' satisfies ShippingHttpErrorCode,
      message: error.message,
    });
  }

  return new BadRequestException({
    code: 'SHIPPING_PROFILE_REQUEST_INVALID' satisfies ShippingHttpErrorCode,
    message: 'Bad shipping profile request',
  });
}
