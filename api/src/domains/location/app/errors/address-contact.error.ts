import { DomainError } from '~/platform/errors/domain.error';

/**
 * A phone number or postcode that does not satisfy the selected country's
 * address rules. HTTP layers map this to a 400 response.
 */
export class AddressContactError extends DomainError {
  constructor(readonly code: string, message: string) {
    super(message, code);
  }
}
