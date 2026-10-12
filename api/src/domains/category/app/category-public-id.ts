/**
 * Category public identities are positive decimal integers without leading
 * zeros. They are always handled as strings so values beyond JavaScript's
 * safe integer range survive transport unchanged.
 */
export const CATEGORY_PUBLIC_ID_PATTERN = /^[1-9][0-9]*$/;

/**
 * Largest value PostgreSQL `bigint` can store (`2^63 - 1`). Any identity beyond
 * this cannot exist in persistence and is treated as absent rather than being
 * sent to the database, where it would surface as a query error.
 */
const POSTGRES_BIGINT_MAX = 9223372036854775807n;

/**
 * Whether a value is a category public identity persistence can hold: positive
 * decimal digits, no leading zeros, and within PostgreSQL `bigint` range.
 * Out-of-range digits stay strings and are rejected as absent, never as errors.
 */
export function isCategoryPublicId(value: string): boolean {
  if (!CATEGORY_PUBLIC_ID_PATTERN.test(value)) {
    return false;
  }

  // A positive bigint has at most 19 digits; avoid parsing unbounded input.
  if (value.length > 19) {
    return false;
  }

  return BigInt(value) <= POSTGRES_BIGINT_MAX;
}
