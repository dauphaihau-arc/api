import { DomainError } from '~/platform/errors/domain.error';

/**
 * A saved-address location selection that cannot be resolved or is not valid
 * for the selected country. The HTTP layer maps this to a 400 response.
 */
export class UserAddressLocationError extends DomainError {
  constructor(readonly code: string, message: string) {
    super(message, code);
  }
}
