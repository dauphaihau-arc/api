import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { FinanceRepositoryContext } from '../../../app/ports/finance-repository-context';
import { PayoutQueryRepository } from '../../../app/ports/payout-query.repository';
import type {
  PayableOrderAmount,
  PayableShop,
  PayoutRecord,
} from '../../../app/ports/payout.types';
import type { PayoutState } from '../../../domain/rules/payout';

/** One `payouts` row, as Postgres returns it. */
interface PayoutRow {
  id: string;
  public_id: string;
  amount_minor: number;
  currency: string;
  state: PayoutState;
  provider_reference: string | null;
  paid_at: Date | null;
  created_at: Date;
}

const PAYOUT_COLUMNS = `id, public_id, amount_minor, currency, state,
       provider_reference, paid_at, created_at`;

/**
 * Reads the availability a Payout Run may pay and the Payouts a shop has already
 * been sent. Raw SQL through `entityManager.execute` so a read can join the
 * caller's transaction when one is supplied.
 */
@Injectable()
export class MikroOrmPayoutQueryRepository implements PayoutQueryRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findPayableShops(
    context?: FinanceRepositoryContext,
  ): Promise<PayableShop[]> {
    return this.getEntityManager(context).execute<PayableShop[]>(
      `select a.shop_id as "shopId", a.currency as "currency"
       from payout_availabilities a
       left join payout_lines l on l.order_id = a.order_id
       where l.id is null
       group by a.shop_id, a.currency
       having sum(a.amount_minor) > 0
       order by a.shop_id asc`,
    );
  }

  async findPayableOrders(
    shopId: string,
    context?: FinanceRepositoryContext,
  ): Promise<PayableOrderAmount[]> {
    return this.getEntityManager(context).execute<PayableOrderAmount[]>(
      `select a.order_id as "orderId", a.amount_minor as "amountMinor"
       from payout_availabilities a
       left join payout_lines l on l.order_id = a.order_id
       where a.shop_id = ? and l.id is null
       order by a.delivered_at asc, a.order_id asc`,
      [shopId],
    );
  }

  async findByShopId(
    shopId: string,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutRecord[]> {
    const rows = await this.getEntityManager(context).execute<PayoutRow[]>(
      `select ${PAYOUT_COLUMNS}
       from payouts
       where shop_id = ?
       order by created_at desc, id desc`,
      [shopId],
    );

    return rows.map((row) => ({
      id: row.id,
      publicId: row.public_id,
      amountMinor: row.amount_minor,
      currency: row.currency,
      state: row.state,
      providerReference: row.provider_reference,
      paidAt: row.paid_at ? new Date(row.paid_at) : null,
      createdAt: new Date(row.created_at),
    }));
  }

  private getEntityManager(context?: FinanceRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
