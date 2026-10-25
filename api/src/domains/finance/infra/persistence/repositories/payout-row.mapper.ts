/**
 * A nullable `bigint` column as Postgres returns it, projected to the
 * application's minor-unit number. Null stays null for Payouts claimed before
 * the conversion quote existed.
 */
export function toNullableMinorUnits(value: string | null): number | null {
  return value === null ? null : Number(value);
}
