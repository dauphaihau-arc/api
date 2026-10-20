import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  PayoutCommandRepository,
  type ClaimPayoutInput,
  type ClaimedPayout,
  type SettlePayoutInput,
} from '../../../app/ports/payout-command.repository';
import type { FinanceRepositoryContext } from '../../../app/ports/finance-repository-context';

/** The claimed row's columns, as Postgres returns them. */
interface ClaimedPayoutRow {
  id: string;
  public_id: string;
  currency: string;
}

/**
 * Persists claimed Payouts and their per-Order discharge lines. Raw SQL through
 * `entityManager.execute` so a write joins the caller's transaction, and
 * `on conflict do nothing` rather than a caught unique violation so a Postgres
 * error inside a caller's transaction never aborts it.
 */
@Injectable()
export class MikroOrmPayoutCommandRepository implements PayoutCommandRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async claim(
    input: ClaimPayoutInput,
    context: FinanceRepositoryContext,
  ): Promise<ClaimedPayout | null> {
    const now = new Date();

    // A Payout left `pending` may still have an unresolved provider transfer, so
    // paying the shop again would send and discharge the same Orders twice. The
    // guard covers every platform day, not only the run's own day; the unique
    // index still keeps two claims for one day to a single row.
    const rows = await this.getEntityManager(context).execute<ClaimedPayoutRow[]>(
      `insert into payouts (
         id, created_at, updated_at, public_id, shop_id, payout_account_id,
         currency, amount_minor, state, provider_reference, attempt_count,
         run_day, paid_at
       )
       select ?, ?, ?, ?, ?, ?, ?, ?, 'pending', null, 1, ?, null
       where not exists (
         select 1 from payouts where shop_id = ? and state = 'pending'
       )
       on conflict (shop_id, run_day) do nothing
       returning id, public_id, currency`,
      [
        randomUUID(),
        now,
        now,
        input.publicId,
        input.shopId,
        input.payoutAccountId,
        input.currency,
        input.amountMinor,
        input.runDay,
        input.shopId,
      ],
    );

    const row = rows[0];

    return row
      ? { id: row.id, publicId: row.public_id, currency: row.currency }
      : null;
  }

  async settle(
    input: SettlePayoutInput,
    context: FinanceRepositoryContext,
  ): Promise<boolean> {
    const entityManager = this.getEntityManager(context);
    const now = new Date();

    const settled = await entityManager.execute<Array<{ id: string }>>(
      `update payouts
       set state = 'paid', provider_reference = ?, paid_at = ?, updated_at = ?
       where id = ? and state = 'pending'
       returning id`,
      [input.providerReference, input.paidAt, now, input.payoutId],
    );

    if (settled.length === 0) {
      return false;
    }

    for (const order of input.orders) {
      await entityManager.execute(
        `insert into payout_lines (
           id, created_at, updated_at, payout_id, order_id, amount_minor
         )
         values (?, ?, ?, ?, ?, ?)
         on conflict (order_id) do nothing`,
        [randomUUID(), now, now, input.payoutId, order.orderId, order.amountMinor],
      );
    }

    return true;
  }

  private getEntityManager(context?: FinanceRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
