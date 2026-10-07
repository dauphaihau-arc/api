/**
 * Guards uuid identifiers that arrive from HTTP path/query params before they
 * reach the database. Postgres rejects malformed uuids on a `uuid` column
 * comparison with SQLSTATE 22P02, which surfaces as an unhandled
 * QueryFailedError (HTTP 500) instead of the intended "not found" answer.
 *
 * Accepts the canonical hyphenated form, the brace-wrapped form, and the
 * unhyphenated 32-hex form that Postgres also accepts, so a value passing this
 * check can never trigger the database cast error.
 */
export function isUuid(value: string): boolean {
  const withoutHyphens = value.replace(/-/g, '');

  return /^[0-9a-f]{32}$/i.test(withoutHyphens)
    || /^\{[0-9a-f]{32}\}$/i.test(withoutHyphens);
}
