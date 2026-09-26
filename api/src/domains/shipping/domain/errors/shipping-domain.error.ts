import { DomainError } from '~/platform/errors/domain.error';

export abstract class ShippingDomainError extends DomainError {
  protected constructor(message: string) {
    super(message);
  }
}

export class InvalidShippingDestinationConfigurationError extends ShippingDomainError {
  constructor(message: string) {
    super(message);
  }
}
