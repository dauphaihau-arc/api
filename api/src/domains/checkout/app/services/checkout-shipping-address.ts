import { resolveCreateAddressLocation } from '~/domains/location/app/address-location.resolver';
import { AddressLocationError } from '~/domains/location/app/errors/address-location.error';
import type { LocationReferenceRepository } from '~/domains/location/app/ports/location-reference.repository';
import type {
  ShippingAddressInput,
  ShippingAddressSelection,
} from '~/domains/order/app/order.types';
import { normalizeShippingPhone } from '~/domains/order/app/shipping-address-snapshot';

/**
 * Every checkout path — saved address, guest cart, and buy-now — resolves its
 * destination through the same Location reference rules, so equivalent
 * destinations produce equivalent quotes and order snapshots.
 */
export async function resolveCheckoutShippingAddress(
  repository: LocationReferenceRepository,
  selection: ShippingAddressSelection,
): Promise<ShippingAddressInput> {
  let location;
  try {
    location = await resolveCreateAddressLocation(repository, selection);
  }
  catch (error) {
    const legacyState = selection.state?.trim();

    // A saved address can carry a subdivision label that the dataset cannot
    // match. Checkout must still price it from the preserved label instead of
    // forcing the buyer to replace their address before quoting.
    if (
      !(error instanceof AddressLocationError)
      || error.code !== 'ADDRESS_STATE_CODE_REQUIRED'
      || !legacyState
      || selection.stateCode
      || selection.countryCode === null
      || selection.countryCode === undefined
    ) {
      throw error;
    }

    location = {
      country: selection.country ?? '',
      state: legacyState,
      countryCode: selection.countryCode,
      stateCode: null,
      countryText: null,
      stateText: legacyState,
    };
  }

  return {
    fullName: selection.fullName,
    address1: selection.address1,
    address2: selection.address2,
    city: selection.city,
    country: location.country,
    state: location.state,
    countryCode: location.countryCode,
    stateCode: location.stateCode,
    zip: selection.zip,
    phone: normalizeShippingPhone(selection.phone),
  };
}
