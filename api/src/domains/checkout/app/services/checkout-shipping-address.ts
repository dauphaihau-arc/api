import { resolveCreateAddressLocation } from '~/domains/location/app/address-location.resolver';
import { resolveCreateAddressContact } from '~/domains/location/app/address-contact.resolver';
import { AddressLocationError } from '~/domains/location/app/errors/address-location.error';
import type { LocationReferenceRepository } from '~/domains/location/app/ports/location-reference.repository';
import type {
  ShippingAddressInput,
  ShippingAddressSelection,
} from '~/domains/order/app/order.types';
import { normalizeShippingPhone } from '~/domains/order/app/shipping-address-snapshot';

/** Where the shipping address came from decides whether it is revalidated. */
export type ShippingAddressSource = 'saved' | 'submitted';

export interface CheckoutShippingAddressOptions {
  /**
   * A saved address was validated when it was written, so an unchanged legacy
   * phone or postcode must not block checkout. Submitted guest details are
   * validated on every quote.
   */
  source?: ShippingAddressSource;
}

/**
 * Every checkout path — saved address, guest cart, and buy-now — resolves its
 * destination through the same Location reference rules, so equivalent
 * destinations produce equivalent quotes and order snapshots.
 */
export async function resolveCheckoutShippingAddress(
  repository: LocationReferenceRepository,
  selection: ShippingAddressSelection,
  options: CheckoutShippingAddressOptions = {},
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

  let contact: { phone: string; zip: string };

  if (options.source === 'saved') {
    contact = {
      phone: normalizeShippingPhone(selection.phone),
      zip: selection.zip,
    };
  }
  else {
    contact = await resolveCreateAddressContact(
      repository,
      location.countryCode,
      { phone: selection.phone, zip: selection.zip },
    );
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
    zip: contact.zip,
    phone: contact.phone,
  };
}
