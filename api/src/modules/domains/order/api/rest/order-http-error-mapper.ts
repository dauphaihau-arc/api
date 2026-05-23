import type { HttpException } from '@nestjs/common';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  AddressNotFoundError,
  AdminOrderStatusOverrideNotAllowedError,
  AdminRefundNotAllowedError,
  BuyerOrderCancelNotAllowedError,
  BuyerShippedOrderCancelNotAllowedError,
  CartNotFoundError,
  CheckoutSessionExpiredError,
  CheckoutSessionIdRequiredError,
  CheckoutSessionNotFoundError,
  InvalidShippingStatusTransitionError,
  OrderAppError,
  OrderNotFoundError,
  SellerOrderCancelNotAllowedError,
  SellerOrderStatusUpdateNotAllowedError,
  SellerShippedOrderCancelNotAllowedError,
  ShipmentUpdateNotAllowedError,
  ShipmentUpdatePayloadRequiredError,
  TemporaryCartNotFoundError,
} from '../../app/errors/order-app.error';

export function isOrderAppError(error: unknown): error is OrderAppError {
  return error instanceof OrderAppError;
}

export function mapOrderAppErrorToHttpException(
  error: OrderAppError
): HttpException {
  if (
    error instanceof CartNotFoundError
    || error instanceof TemporaryCartNotFoundError
    || error instanceof AddressNotFoundError
    || error instanceof OrderNotFoundError
    || error instanceof CheckoutSessionNotFoundError
    || error instanceof CheckoutSessionExpiredError
  ) {
    return new NotFoundException(error.message);
  }

  if (
    error instanceof CheckoutSessionIdRequiredError
    || error instanceof SellerOrderStatusUpdateNotAllowedError
    || error instanceof SellerOrderCancelNotAllowedError
    || error instanceof SellerShippedOrderCancelNotAllowedError
    || error instanceof BuyerOrderCancelNotAllowedError
    || error instanceof BuyerShippedOrderCancelNotAllowedError
    || error instanceof ShipmentUpdatePayloadRequiredError
    || error instanceof ShipmentUpdateNotAllowedError
    || error instanceof InvalidShippingStatusTransitionError
    || error instanceof AdminOrderStatusOverrideNotAllowedError
    || error instanceof AdminRefundNotAllowedError
  ) {
    return new BadRequestException(error.message);
  }

  return new BadRequestException(error.message);
}
