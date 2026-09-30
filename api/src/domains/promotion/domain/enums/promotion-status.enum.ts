/**
 * The lifecycle state a Promotion presents to sellers, derived from its
 * Promotion Period and retained stop state:
 *
 * - `scheduled`: created, start instant still in the future.
 * - `active`: inside the Promotion Period, not stopped.
 * - `ended`: reached its end instant, or irreversibly ended early.
 * - `cancelled`: irreversibly stopped before it started.
 *
 * Code exhaustion is not a lifecycle state; it is a separate allowance
 * indicator on the Promo Code.
 */
export enum PromotionStatus {
  SCHEDULED = 'scheduled',
  ACTIVE = 'active',
  ENDED = 'ended',
  CANCELLED = 'cancelled',
}
