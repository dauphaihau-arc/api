import { DomainError } from '~/platform/errors/domain.error';

export abstract class FulfillmentDomainError extends DomainError {
  protected constructor(message: string) {
    super(message);
  }
}

export class UnsupportedFulfillmentMethodError extends FulfillmentDomainError {
  constructor() {
    super('Only seller fulfillment is currently supported');
  }
}

export class InvalidFulfillmentQuantityError extends FulfillmentDomainError {
  constructor() {
    super('Fulfillment quantities must be positive whole numbers');
  }
}

export class ShipmentNotPreparedError extends FulfillmentDomainError {
  constructor() {
    super('Shipment preparation can only be changed before dispatch');
  }
}

export class ShipmentAlreadyVoidedError extends FulfillmentDomainError {
  constructor() {
    super('Shipment preparation is already voided');
  }
}

export class InvalidShipmentJourneyTransitionError extends FulfillmentDomainError {
  constructor() {
    super('Invalid shipment journey transition');
  }
}

export class ShipmentItemNotInGroupError extends FulfillmentDomainError {
  constructor() {
    super('Shipment items must belong to the order item quantities in this fulfillment group');
  }
}

export class ShipmentQuantityExceededError extends FulfillmentDomainError {
  constructor() {
    super('Shipment quantity exceeds the group quantity still available to ship');
  }
}
