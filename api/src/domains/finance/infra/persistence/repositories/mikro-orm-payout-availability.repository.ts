import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { FinanceRepositoryContext } from '../../../app/ports/finance-repository-context';
import { PayoutAvailabilityRepository } from '../../../app/ports/payout-availability.repository';
import type { PayoutAvailability } from '../../../domain/value-objects/payout-availability';

@Injectable()
export class MikroOrmPayoutAvailabilityRepository implements PayoutAvailabilityRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async record(
    availability: PayoutAvailability,
    context: FinanceRepositoryContext,
  ): Promise<boolean> {
    const now = new Date();

    // `entityManager.execute` (never `getConnection().execute`) so the write
    // joins the caller's transaction. On conflict do nothing rather than
    // catching the unique violation: a Postgres error inside the caller's
    // transaction would abort it.
    const inserted = await this.getEntityManager(context).execute<
      Array<{ id: string }>
    >(
      `insert into payout_availabilities (
         id, order_id, shop_id, currency, amount_minor, delivered_at, evidence,
         created_at, updated_at
       )
       values (?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?)
       on conflict (order_id) do nothing
       returning id`,
      [
        randomUUID(),
        availability.orderId,
        availability.shopId,
        availability.currency,
        availability.amountMinor,
        availability.deliveredAt,
        JSON.stringify(availability.evidence),
        now,
        now,
      ],
    );

    return inserted.length > 0;
  }

  private getEntityManager(context?: FinanceRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
