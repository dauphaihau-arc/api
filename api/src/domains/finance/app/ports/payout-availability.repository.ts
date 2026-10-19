import type { PayoutAvailability } from '../../domain/value-objects/payout-availability';
import type { FinanceRepositoryContext } from './finance-repository-context';

export abstract class PayoutAvailabilityRepository {
  /**
   * Records that one Order's payout became available.
   *
   * Returns `true` when this call recorded the availability, and `false` when
   * one for the same Order already existed (a replay). The insert is race-safe:
   * concurrent calls for one Order must not both record, and a lost race must
   * not abort the surrounding transaction.
   */
  abstract record(
    availability: PayoutAvailability,
    context: FinanceRepositoryContext,
  ): Promise<boolean>;
}
