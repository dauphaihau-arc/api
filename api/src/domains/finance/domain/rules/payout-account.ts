import { PayoutAccountInvalidError } from '../errors/finance-domain.error';

/**
 * The payout adapter that moves the money. There is one for now: an operator
 * pays out against the recorded bank details, and a provider integration would
 * add its own tokenised provider beside it.
 */
export const MANUAL_BANK_PROVIDER = 'manual_bank';

/** A Payout Account row's lifecycle; only an operator verifies or disables one. */
export type PayoutAccountStatus = 'pending' | 'active' | 'disabled';

/**
 * What the seller supplies when recording a Payout Account. The currency is
 * resolved server-side from the shop's Settlement Currency, never accepted from
 * the caller.
 */
export interface PayoutAccountInput {
  holderName: string;
  bankName: string;
  country: string;
  accountReference: string;
}

/** A Payout Account input once validation has accepted it. */
export type ValidatedPayoutAccountInput = PayoutAccountInput;

const MIN_REFERENCE_LENGTH = 4;
const MAX_REFERENCE_LENGTH = 34;
const REFERENCE_PATTERN = /^[A-Za-z0-9-]+$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;

/**
 * Refuses a Payout Account that cannot be paid into: a blank
 * holder or bank name, a country that is not an ISO 3166-1 alpha-2 code, or a
 * reference shorter than 4 characters, longer than 34, or carrying characters
 * outside letters, digits and dash.
 */
export function assertValidPayoutAccount(
  input: PayoutAccountInput,
): asserts input is ValidatedPayoutAccountInput {
  if (input.holderName.trim().length === 0) {
    throw new PayoutAccountInvalidError('holder name must not be blank');
  }

  if (input.bankName.trim().length === 0) {
    throw new PayoutAccountInvalidError('bank name must not be blank');
  }

  if (!COUNTRY_PATTERN.test(input.country.toUpperCase())) {
    throw new PayoutAccountInvalidError(
      'country must be an ISO 3166-1 alpha-2 code',
    );
  }

  if (
    input.accountReference.length < MIN_REFERENCE_LENGTH
    || input.accountReference.length > MAX_REFERENCE_LENGTH
    || !REFERENCE_PATTERN.test(input.accountReference)
  ) {
    throw new PayoutAccountInvalidError(
      `account reference must be ${MIN_REFERENCE_LENGTH} to ${MAX_REFERENCE_LENGTH} letters, digits or dashes`,
    );
  }
}

/**
 * The display-safe tail of a reference. Last4 is the only part of the reference
 * that ever leaves persistence, so the response can identify the account
 * without disclosing how to move money into it.
 */
export function maskReference(reference: string): { last4: string } {
  return { last4: reference.slice(-4) };
}

/** The statuses an operator may move an open Payout Account into. */
export type PayoutAccountVerificationStatus = 'active' | 'disabled';

const VERIFICATION_STATUSES: readonly PayoutAccountVerificationStatus[] = [
  'active',
  'disabled',
];

/** Refuses a verification status that is neither `active` nor `disabled`. */
export function assertValidPayoutAccountVerificationStatus(
  status: string,
): asserts status is PayoutAccountVerificationStatus {
  if (!VERIFICATION_STATUSES.includes(status as PayoutAccountVerificationStatus)) {
    throw new PayoutAccountInvalidError(
      `status must be one of ${VERIFICATION_STATUSES.join(', ')}`,
    );
  }
}
