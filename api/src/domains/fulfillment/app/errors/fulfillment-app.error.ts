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

export class ShipmentLabelNotFoundError extends FulfillmentAppError {
  constructor() {
    super('This shipment has no purchased label');
  }
}

/**
 * The carrier has already scanned the parcel, so its label is in use and can
 * no longer be refunded.
 */
export class ShipmentLabelUsedError extends FulfillmentAppError {
  constructor() {
    super('This shipment label has already been used');
  }
}

/**
 * The carrier no longer honours the quote (unknown, expired, or already used).
 * Buying again with the same quote cannot succeed, so the seller must re-quote.
 */
export class RateQuoteExpiredError extends FulfillmentAppError {
  constructor() {
    super('This rate quote has expired or was already used; request new rates');
  }
}

/**
 * A deployment without a usable carrier integration still starts; only a label
 * purchase answers 503 because it has no local fallback.
 */
export class CarrierLabelUnavailableError extends FulfillmentAppError {
  constructor() {
    super('Carrier labels are temporarily unavailable');
  }
}

/**
 * A deployment without a Mock Carrier URL still starts; only a rate quote
 * answers 503 because it has no local fallback.
 */
export class CarrierRatesUnavailableError extends FulfillmentAppError {
  constructor() {
    super('Shipping rates are temporarily unavailable');
  }
}

/** A labeled Shipment can only be undone through its Label refund. */
export class ShipmentLabelRequiresRefundError extends FulfillmentAppError {
  constructor() {
    super('Refund the label to void this shipment');
  }
}
