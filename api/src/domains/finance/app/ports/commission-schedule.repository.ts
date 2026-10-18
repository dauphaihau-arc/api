import type { CommissionSchedule } from '../../domain/rules/commission-schedule';
import type { FinanceRepositoryContext } from './finance-repository-context';

export abstract class CommissionScheduleRepository {
  /**
   * Every recorded Commission Schedule of a shop, keyed by its effective-from
   * instant. Which one governed a given Money Event is a domain decision
   * (`resolveEffectiveSchedule`), so the reader stays a plain read.
   */
  abstract listByShopId(
    shopId: string,
    context?: FinanceRepositoryContext,
  ): Promise<CommissionSchedule[]>;

  /**
   * Records a Commission Schedule, replacing the rate of the shop's schedule
   * that already takes effect at the same instant. Schedules effective at other
   * instants are untouched, so replacing a rate never rewrites history.
   */
  abstract upsert(
    shopId: string,
    effectiveFrom: Date,
    rateBasisPoints: number,
    context?: FinanceRepositoryContext,
  ): Promise<CommissionSchedule>;
}
