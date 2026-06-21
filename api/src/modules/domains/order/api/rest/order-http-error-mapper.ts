import type { HttpException } from '@nestjs/common';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  AddressNotFoundError,
  AdminOrderStatusOverrideNotAllowedError,
  AdminRefundActionNotAllowedError,
  AdminRefundNotAllowedError,
  AdminRefundRequiresCardPaymentError,
  BuyerOrderCancelNotAllowedError,
  BuyerShippedOrderCancelNotAllowedError,
  CartNotFoundError,
  CheckoutQuoteNoItemsError,
  CheckoutQuoteNotFoundError,
  CheckoutQuoteCartChangedError,
  CheckoutQuoteExpiredError,
  CheckoutSessionExpiredError,
  CheckoutSessionIdRequiredError,
  CheckoutSessionNotFoundError,
  InvalidShippingStatusTransitionError,
  OrderAppError,
  OrderNotFoundError,
  OrderTotalLimitExceededError,
  SellerRefundActionNotAllowedError,
  SellerRefundNotAllowedError,
  SellerRefundRequiresCardPaymentError,
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
  error: OrderAppError,
): HttpException {
  if (
    error instanceof CartNotFoundError
    || error instanceof TemporaryCartNotFoundError
    || error instanceof AddressNotFoundError
    || error instanceof OrderNotFoundError
    || error instanceof CheckoutSessionNotFoundError
    || error instanceof CheckoutSessionExpiredError
    || error instanceof CheckoutQuoteNotFoundError
  ) {
    return new NotFoundException(error.message);
  }

  if (
    error instanceof CheckoutSessionIdRequiredError
    || error instanceof SellerOrderStatusUpdateNotAllowedError
    || error instanceof SellerOrderCancelNotAllowedError
    || error instanceof SellerShippedOrderCancelNotAllowedError
    || error instanceof SellerRefundActionNotAllowedError
    || error instanceof SellerRefundNotAllowedError
    || error instanceof SellerRefundRequiresCardPaymentError
    || error instanceof BuyerOrderCancelNotAllowedError
    || error instanceof BuyerShippedOrderCancelNotAllowedError
    || error instanceof ShipmentUpdatePayloadRequiredError
    || error instanceof ShipmentUpdateNotAllowedError
    || error instanceof InvalidShippingStatusTransitionError
    || error instanceof AdminOrderStatusOverrideNotAllowedError
    || error instanceof AdminRefundActionNotAllowedError
    || error instanceof AdminRefundNotAllowedError
    || error instanceof AdminRefundRequiresCardPaymentError
    || error instanceof CheckoutQuoteNoItemsError
    || error instanceof CheckoutQuoteCartChangedError
    || error instanceof CheckoutQuoteExpiredError
    || error instanceof OrderTotalLimitExceededError
  ) {
    return new BadRequestException(error.message);
  }

  return new BadRequestException(error.message);
}
