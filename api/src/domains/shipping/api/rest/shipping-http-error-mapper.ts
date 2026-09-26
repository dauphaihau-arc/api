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
} from '../../app/errors/shipping-app.error';

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
    return new NotFoundException(error.message);
  }

  if (error instanceof ShippingProfileNotCheckoutReadyError) {
    return new ConflictException({ code: error.code, message: error.message });
  }

  if (error instanceof ShippingProfileNameTakenError) {
    return new ConflictException({ code: error.code, message: error.message });
  }

  if (error instanceof ShippingProfileArchivedError) {
    return new ConflictException({ code: error.code, message: error.message });
  }

  if (error instanceof ShippingProfileReadinessRequiredError) {
    return new ConflictException({
      code: error.code,
      message: error.message,
      published_product_count: error.publishedProductCount,
    });
  }

  if (error instanceof ShippingProfileInUseError) {
    return new ConflictException({
      code: error.code,
      message: error.message,
      assigned_product_count: error.assignedProductCount,
    });
  }

  if (error instanceof ShippingProfileVersionConflictError) {
    return new ConflictException({
      code: error.code,
      message: error.message,
      version: error.currentProfile.version,
    });
  }

  if (error instanceof InvalidShippingProfileError) {
    return new UnprocessableEntityException({ code: error.name, message: error.message });
  }

  return new BadRequestException('Bad shipping profile request');
}
