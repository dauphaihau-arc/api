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
  CheckoutQuoteReservationOutOfStockError,
  CheckoutQuoteReservationUnavailableError,
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
} from '../../../order/app/errors/order-app.error';

export function isCheckoutAppError(error: unknown): error is OrderAppError {
  return error instanceof OrderAppError;
}

type CheckoutHttpErrorCode =
  | 'CART_NOT_FOUND'
  | 'TEMP_CART_NOT_FOUND'
  | 'ADDRESS_NOT_FOUND'
  | 'CHECKOUT_QUOTE_NO_ITEMS'
  | 'CHECKOUT_QUOTE_NOT_FOUND'
  | 'CHECKOUT_QUOTE_EXPIRED'
  | 'CHECKOUT_QUOTE_RESERVATION_UNAVAILABLE'
  | 'CHECKOUT_QUOTE_RESERVATION_OUT_OF_STOCK'
  | 'CHECKOUT_QUOTE_CART_CHANGED'
  | 'ORDER_TOTAL_LIMIT_EXCEEDED'
  | 'ORDER_NOT_FOUND'
  | 'CHECKOUT_SESSION_ID_REQUIRED'
  | 'CHECKOUT_SESSION_NOT_FOUND'
  | 'CHECKOUT_SESSION_EXPIRED'
  | 'SELLER_ORDER_STATUS_UPDATE_NOT_ALLOWED'
  | 'SELLER_ORDER_CANCEL_NOT_ALLOWED'
  | 'SELLER_SHIPPED_ORDER_CANCEL_NOT_ALLOWED'
  | 'SELLER_REFUND_NOT_ALLOWED'
  | 'SELLER_REFUND_REQUIRES_CARD_PAYMENT'
  | 'SELLER_REFUND_ACTION_NOT_ALLOWED'
  | 'BUYER_ORDER_CANCEL_NOT_ALLOWED'
  | 'BUYER_SHIPPED_ORDER_CANCEL_NOT_ALLOWED'
  | 'SHIPMENT_UPDATE_PAYLOAD_REQUIRED'
  | 'SHIPMENT_UPDATE_NOT_ALLOWED'
  | 'INVALID_SHIPPING_STATUS_TRANSITION'
  | 'ADMIN_ORDER_STATUS_OVERRIDE_NOT_ALLOWED'
  | 'ADMIN_REFUND_NOT_ALLOWED'
  | 'ADMIN_REFUND_REQUIRES_CARD_PAYMENT'
  | 'ADMIN_REFUND_ACTION_NOT_ALLOWED';

export function mapCheckoutAppErrorToHttpException(
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
    return new NotFoundException(buildCheckoutErrorPayload(error));
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
    || error instanceof CheckoutQuoteReservationUnavailableError
    || error instanceof CheckoutQuoteReservationOutOfStockError
    || error instanceof OrderTotalLimitExceededError
  ) {
    return new BadRequestException(buildCheckoutErrorPayload(error));
  }

  return new BadRequestException(buildCheckoutErrorPayload(error));
}

function buildCheckoutErrorPayload(error: OrderAppError): {
  message: string;
  code: CheckoutHttpErrorCode;
} {
  return {
    message: error.message,
    code: getCheckoutErrorCode(error),
  };
}

function getCheckoutErrorCode(error: OrderAppError): CheckoutHttpErrorCode {
  if (error instanceof CartNotFoundError) {
    return 'CART_NOT_FOUND';
  }
  if (error instanceof TemporaryCartNotFoundError) {
    return 'TEMP_CART_NOT_FOUND';
  }
  if (error instanceof AddressNotFoundError) {
    return 'ADDRESS_NOT_FOUND';
  }
  if (error instanceof CheckoutQuoteNoItemsError) {
    return 'CHECKOUT_QUOTE_NO_ITEMS';
  }
  if (error instanceof CheckoutQuoteNotFoundError) {
    return 'CHECKOUT_QUOTE_NOT_FOUND';
  }
  if (error instanceof CheckoutQuoteExpiredError) {
    return 'CHECKOUT_QUOTE_EXPIRED';
  }
  if (error instanceof CheckoutQuoteReservationUnavailableError) {
    return 'CHECKOUT_QUOTE_RESERVATION_UNAVAILABLE';
  }
  if (error instanceof CheckoutQuoteReservationOutOfStockError) {
    return 'CHECKOUT_QUOTE_RESERVATION_OUT_OF_STOCK';
  }
  if (error instanceof CheckoutQuoteCartChangedError) {
    return 'CHECKOUT_QUOTE_CART_CHANGED';
  }
  if (error instanceof OrderTotalLimitExceededError) {
    return 'ORDER_TOTAL_LIMIT_EXCEEDED';
  }
  if (error instanceof OrderNotFoundError) {
    return 'ORDER_NOT_FOUND';
  }
  if (error instanceof CheckoutSessionIdRequiredError) {
    return 'CHECKOUT_SESSION_ID_REQUIRED';
  }
  if (error instanceof CheckoutSessionNotFoundError) {
    return 'CHECKOUT_SESSION_NOT_FOUND';
  }
  if (error instanceof CheckoutSessionExpiredError) {
    return 'CHECKOUT_SESSION_EXPIRED';
  }
  if (error instanceof SellerOrderStatusUpdateNotAllowedError) {
    return 'SELLER_ORDER_STATUS_UPDATE_NOT_ALLOWED';
  }
  if (error instanceof SellerOrderCancelNotAllowedError) {
    return 'SELLER_ORDER_CANCEL_NOT_ALLOWED';
  }
  if (error instanceof SellerShippedOrderCancelNotAllowedError) {
    return 'SELLER_SHIPPED_ORDER_CANCEL_NOT_ALLOWED';
  }
  if (error instanceof SellerRefundNotAllowedError) {
    return 'SELLER_REFUND_NOT_ALLOWED';
  }
  if (error instanceof SellerRefundRequiresCardPaymentError) {
    return 'SELLER_REFUND_REQUIRES_CARD_PAYMENT';
  }
  if (error instanceof SellerRefundActionNotAllowedError) {
    return 'SELLER_REFUND_ACTION_NOT_ALLOWED';
  }
  if (error instanceof BuyerOrderCancelNotAllowedError) {
    return 'BUYER_ORDER_CANCEL_NOT_ALLOWED';
  }
  if (error instanceof BuyerShippedOrderCancelNotAllowedError) {
    return 'BUYER_SHIPPED_ORDER_CANCEL_NOT_ALLOWED';
  }
  if (error instanceof ShipmentUpdatePayloadRequiredError) {
    return 'SHIPMENT_UPDATE_PAYLOAD_REQUIRED';
  }
  if (error instanceof ShipmentUpdateNotAllowedError) {
    return 'SHIPMENT_UPDATE_NOT_ALLOWED';
  }
  if (error instanceof InvalidShippingStatusTransitionError) {
    return 'INVALID_SHIPPING_STATUS_TRANSITION';
  }
  if (error instanceof AdminOrderStatusOverrideNotAllowedError) {
    return 'ADMIN_ORDER_STATUS_OVERRIDE_NOT_ALLOWED';
  }
  if (error instanceof AdminRefundNotAllowedError) {
    return 'ADMIN_REFUND_NOT_ALLOWED';
  }
  if (error instanceof AdminRefundRequiresCardPaymentError) {
    return 'ADMIN_REFUND_REQUIRES_CARD_PAYMENT';
  }
  return 'ADMIN_REFUND_ACTION_NOT_ALLOWED';
}
