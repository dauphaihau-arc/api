import type { HttpException } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  FulfillmentAppError,
  FulfillmentGroupAlreadyAssignedError,
  FulfillmentGroupNotFoundError,
  FulfillmentGroupSelectionRequiredError,
  FulfillmentOrderNotFoundError,
  FulfillmentReconciliationIncompleteError,
  FulfillmentReconciliationRequiredError,
  OrderNotEligibleForFulfillmentError,
  ShipmentNotFoundError,
} from '../../../app/errors/fulfillment-app.error';
import {
  FulfillmentDomainError,
  InvalidFulfillmentQuantityError,
  InvalidShipmentJourneyTransitionError,
  ShipmentAlreadyVoidedError,
  ShipmentItemNotInGroupError,
  ShipmentNotPreparedError,
  ShipmentQuantityExceededError,
  UnsupportedFulfillmentMethodError,
} from '../../../domain/errors/fulfillment-domain.error';

export type FulfillmentError = FulfillmentAppError | FulfillmentDomainError;

type FulfillmentHttpErrorCode =
  | 'ORDER_NOT_ELIGIBLE_FOR_FULFILLMENT'
  | 'FULFILLMENT_ORDER_NOT_FOUND'
  | 'FULFILLMENT_RECONCILIATION_REQUIRED'
  | 'FULFILLMENT_RECONCILIATION_INCOMPLETE'
  | 'FULFILLMENT_GROUP_NOT_FOUND'
  | 'FULFILLMENT_GROUP_ALREADY_ASSIGNED'
  | 'FULFILLMENT_GROUP_SELECTION_REQUIRED'
  | 'UNSUPPORTED_FULFILLMENT_METHOD'
  | 'SHIPMENT_NOT_FOUND'
  | 'SHIPMENT_NOT_PREPARED'
  | 'SHIPMENT_ALREADY_VOIDED'
  | 'INVALID_SHIPMENT_JOURNEY_TRANSITION'
  | 'SHIPMENT_ITEM_NOT_IN_GROUP'
  | 'SHIPMENT_QUANTITY_EXCEEDED'
  | 'INVALID_FULFILLMENT_QUANTITY';

export function isFulfillmentError(error: unknown): error is FulfillmentError {
  return error instanceof FulfillmentAppError || error instanceof FulfillmentDomainError;
}

export function mapFulfillmentErrorToHttpException(
  error: FulfillmentError,
): HttpException {
  const payload = {
    message: error.message,
    code: getFulfillmentErrorCode(error),
  };

  if (
    error instanceof FulfillmentGroupNotFoundError
    || error instanceof FulfillmentOrderNotFoundError
    || error instanceof ShipmentNotFoundError
  ) {
    return new NotFoundException(payload);
  }

  if (
    error instanceof FulfillmentReconciliationRequiredError
    || error instanceof FulfillmentGroupAlreadyAssignedError
    || error instanceof ShipmentNotPreparedError
    || error instanceof ShipmentAlreadyVoidedError
    || error instanceof InvalidShipmentJourneyTransitionError
    || error instanceof ShipmentQuantityExceededError
  ) {
    return new ConflictException(payload);
  }

  return new BadRequestException(payload);
}

function getFulfillmentErrorCode(error: FulfillmentError): FulfillmentHttpErrorCode {
  if (error instanceof OrderNotEligibleForFulfillmentError) {
    return 'ORDER_NOT_ELIGIBLE_FOR_FULFILLMENT';
  }
  if (error instanceof FulfillmentOrderNotFoundError) {
    return 'FULFILLMENT_ORDER_NOT_FOUND';
  }
  if (error instanceof FulfillmentReconciliationRequiredError) {
    return 'FULFILLMENT_RECONCILIATION_REQUIRED';
  }
  if (error instanceof FulfillmentReconciliationIncompleteError) {
    return 'FULFILLMENT_RECONCILIATION_INCOMPLETE';
  }
  if (error instanceof FulfillmentGroupNotFoundError) {
    return 'FULFILLMENT_GROUP_NOT_FOUND';
  }
  if (error instanceof FulfillmentGroupAlreadyAssignedError) {
    return 'FULFILLMENT_GROUP_ALREADY_ASSIGNED';
  }
  if (error instanceof FulfillmentGroupSelectionRequiredError) {
    return 'FULFILLMENT_GROUP_SELECTION_REQUIRED';
  }
  if (error instanceof UnsupportedFulfillmentMethodError) {
    return 'UNSUPPORTED_FULFILLMENT_METHOD';
  }
  if (error instanceof ShipmentNotFoundError) {
    return 'SHIPMENT_NOT_FOUND';
  }
  if (error instanceof ShipmentNotPreparedError) {
    return 'SHIPMENT_NOT_PREPARED';
  }
  if (error instanceof ShipmentAlreadyVoidedError) {
    return 'SHIPMENT_ALREADY_VOIDED';
  }
  if (error instanceof InvalidShipmentJourneyTransitionError) {
    return 'INVALID_SHIPMENT_JOURNEY_TRANSITION';
  }
  if (error instanceof ShipmentItemNotInGroupError) {
    return 'SHIPMENT_ITEM_NOT_IN_GROUP';
  }
  if (error instanceof ShipmentQuantityExceededError) {
    return 'SHIPMENT_QUANTITY_EXCEEDED';
  }
  if (error instanceof InvalidFulfillmentQuantityError) {
    return 'INVALID_FULFILLMENT_QUANTITY';
  }

  return 'ORDER_NOT_ELIGIBLE_FOR_FULFILLMENT';
}
