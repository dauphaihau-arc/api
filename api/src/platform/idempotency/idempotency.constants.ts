export const IDEMPOTENCY_REDIS = Symbol('IDEMPOTENCY_REDIS');
export const IDEMPOTENCY_OPTIONS = Symbol('IDEMPOTENCY_OPTIONS');

export interface IdempotencyOptions {
  scope: string;
  responseTtlMs?: number;
  inFlightTtlMs?: number;
}
