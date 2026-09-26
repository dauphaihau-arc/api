import { DomainError } from '~/platform/errors/domain.error';
import type { ShippingProfileSummary } from '../shipping.types';

export abstract class ShippingAppError extends DomainError {
  protected constructor(message: string) {
    super(message);
  }
}

export class ShippingProfileNotFoundError extends ShippingAppError {
  constructor(shippingProfileId: string) {
    super(`Shipping profile "${shippingProfileId}" was not found`);
  }
}

export class ShippingProfileNameTakenError extends ShippingAppError {
  constructor(name: string) {
    super(`Shipping profile name "${name}" is already used in this shop`);
  }
}

export class InvalidShippingProfileError extends ShippingAppError {
  constructor(message: string) {
    super(message);
  }
}

export class ShippingProfileVersionConflictError extends ShippingAppError {
  constructor(public readonly currentProfile: ShippingProfileSummary) {
    super('Shipping profile was updated by another request');
  }
}

export class ShippingProfileArchivedError extends ShippingAppError {
  constructor(message = 'Archived shipping profiles cannot be edited or assigned') {
    super(message);
  }
}

export class ShippingProfileNotCheckoutReadyError extends ShippingAppError {
  constructor(message = 'Only a checkout-ready shipping profile can be the shop default') {
    super(message);
  }
}

export class ShippingProfileReadinessRequiredError extends ShippingAppError {
  constructor(
    public readonly publishedProductCount: number,
    message = 'Published products must be reassigned to a checkout-ready shipping profile before this one can stop pricing checkouts',
  ) {
    super(message);
  }
}

export class ShippingProfileInUseError extends ShippingAppError {
  constructor(
    public readonly assignedProductCount: number,
    message = 'Published products must be reassigned before this shipping profile can be archived',
  ) {
    super(message);
  }
}
