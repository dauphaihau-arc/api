import { DomainError } from '~/platform/errors/domain.error';

/**
 * A use case cannot proceed because of orchestration, lookup, or workflow state
 * rather than an invalid value or entity.
 */
export abstract class FulfillmentAppError extends DomainError {
  protected constructor(message: string) {
    super(message);
  }
}

export class FulfillmentOrderNotFoundError extends FulfillmentAppError {
  constructor() {
    super('Order was not found');
  }
}

export class OrderNotEligibleForFulfillmentError extends FulfillmentAppError {
  constructor() {
    super('This order is not eligible for fulfillment changes');
  }
}

export class FulfillmentGroupNotFoundError extends FulfillmentAppError {
  constructor() {
    super('Fulfillment group not found for this order');
  }
}

export class FulfillmentGroupAlreadyAssignedError extends FulfillmentAppError {
  constructor() {
    super('Order already has an assigned fulfillment group');
  }
}

export class FulfillmentGroupSelectionRequiredError extends FulfillmentAppError {
  constructor() {
    super('This order has multiple fulfillment groups; select one');
  }
}

export class FulfillmentReconciliationRequiredError extends FulfillmentAppError {
  constructor() {
    super(
      'This order has no fulfillment assignment yet; reconcile its remaining quantities before shipping',
    );
  }
}

export class FulfillmentReconciliationIncompleteError extends FulfillmentAppError {
  constructor() {
    super(
      'Reconciliation must attest the full remaining quantity of every order item',
    );
  }
}

export class ShipmentNotFoundError extends FulfillmentAppError {
  constructor() {
    super('Shipment not found for this order');
  }
}
