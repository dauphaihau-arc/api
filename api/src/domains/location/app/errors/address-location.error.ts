import { DomainError } from '~/platform/errors/domain.error';

/**
 * An address location selection that cannot be resolved or is not valid for
 * the selected country. HTTP layers map this to a 400 response.
 */
export class AddressLocationError extends DomainError {
  constructor(readonly code: string, message: string) {
    super(message, code);
  }
}
