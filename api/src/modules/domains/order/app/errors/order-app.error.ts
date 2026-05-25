import { DomainError } from '~/common/errors/domain.error';

export abstract class OrderAppError extends DomainError {
  protected constructor(message: string) {
    super(message);
  }
}

export class CartNotFoundError extends OrderAppError {
  constructor() {
    super('Cart not found');
  }
}

export class TemporaryCartNotFoundError extends OrderAppError {
  constructor() {
    super('Temporary cart not found');
  }
}

export class AddressNotFoundError extends OrderAppError {
  constructor() {
    super('Address not found');
  }
}

export class OrderNotFoundError extends OrderAppError {
  constructor() {
    super('Order was not found');
  }
}

export class CheckoutSessionIdRequiredError extends OrderAppError {
  constructor() {
    super('session_id is required');
  }
}

export class CheckoutSessionNotFoundError extends OrderAppError {
  constructor() {
    super('Checkout session not found');
  }
}

export class CheckoutSessionExpiredError extends OrderAppError {
  constructor() {
    super('Checkout session expired');
  }
}

export class SellerOrderStatusUpdateNotAllowedError extends OrderAppError {
  constructor() {
    super('Sellers can only cancel orders through this endpoint');
  }
}

export class SellerOrderCancelNotAllowedError extends OrderAppError {
  constructor() {
    super('Only pending or paid orders can be canceled by the seller');
  }
}

export class SellerShippedOrderCancelNotAllowedError extends OrderAppError {
  constructor() {
    super('Shipped or in-transit orders cannot be canceled by the seller');
  }
}

export class BuyerOrderCancelNotAllowedError extends OrderAppError {
  constructor() {
    super('This order can no longer be canceled');
  }
}

export class BuyerShippedOrderCancelNotAllowedError extends OrderAppError {
  constructor() {
    super('Shipped orders cannot be canceled');
  }
}

export class ShipmentUpdatePayloadRequiredError extends OrderAppError {
  constructor() {
    super('At least one shipment field must be provided');
  }
}

export class ShipmentUpdateNotAllowedError extends OrderAppError {
  constructor() {
    super('This order cannot be updated for shipment');
  }
}

export class InvalidShippingStatusTransitionError extends OrderAppError {
  constructor() {
    super('Invalid shipping status transition');
  }
}

export class AdminOrderStatusOverrideNotAllowedError extends OrderAppError {
  constructor() {
    super('Admin overrides only support canceled, refunded, or archived');
  }
}

export class AdminRefundNotAllowedError extends OrderAppError {
  constructor() {
    super('Unpaid or expired orders cannot be marked refunded');
  }
}

export class AdminRefundRequiresCardPaymentError extends OrderAppError {
  constructor() {
    super('Only card orders support refund actions');
  }
}

export class AdminRefundActionNotAllowedError extends OrderAppError {
  constructor() {
    super('This refund action is not allowed for the current order state');
  }
}
