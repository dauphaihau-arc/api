import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { FinanceRepositoryContext } from '../../../app/ports/finance-repository-context';
import {
  OrderPayoutQueryRepository,
  type OrderPayoutFacts,
} from '../../../app/ports/order-payout-query.repository';

/** One row of the Order payout-facts read, as Postgres returns it. */
interface OrderPayoutRow {
  orderPublicId: string;
  shopId: string;
  currency: string;
  availableAt: Date | null;
  availableAmountMinor: number | null;
  payoutId: string | null;
  payoutState: 'pending' | 'paid' | null;
  payoutAmountMinor: number | null;
  payoutPaidAt: Date | null;
}

function toOrderPayoutFacts(row: OrderPayoutRow): OrderPayoutFacts {
  return {
    orderPublicId: row.orderPublicId,
    shopId: row.shopId,
    currency: row.currency,
    availability:
      row.availableAt === null || row.availableAmountMinor === null
        ? null
        : {
          recorded: true,
          availableAt: new Date(row.availableAt),
          amountMinor: row.availableAmountMinor,
        },
    payout:
      row.payoutId === null
      || row.payoutState === null
      || row.payoutAmountMinor === null
        ? null
        : {
          id: row.payoutId,
          state: row.payoutState,
          amountMinor: row.payoutAmountMinor,
          paidAt: row.payoutPaidAt === null ? null : new Date(row.payoutPaidAt),
        },
  };
}

/**
 * Reads the payout facts attributable to one Order through raw SQL, like the
 * Payout query repository, so a read can join the caller's transaction when one
 * is supplied.
 *
 * The Order header (public id, shop, currency) is read here rather than handed
 * in as an Order entity: Finance references Orders by identity and must not
 * depend on Ordering's persistence model. Availability comes only from
 * `payout_availabilities` — never from the Order's status — and a Payout is
 * attributable only through what it recorded: a `payout_lines` row once it
 * settled, or the frozen `claimed_allocations` entry while it is still
 * `pending`.
 */
@Injectable()
export class MikroOrmOrderPayoutQueryRepository
implements OrderPayoutQueryRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findOrderPayoutFacts(
    orderId: string,
    context?: FinanceRepositoryContext,
  ): Promise<OrderPayoutFacts | null> {
    const rows = await this.getEntityManager(context).execute<OrderPayoutRow[]>(
      `select o.public_id as "orderPublicId",
              o.shop_id as "shopId",
              o.currency as "currency",
              a.delivered_at as "availableAt",
              a.amount_minor as "availableAmountMinor",
              attribution.payout_public_id as "payoutId",
              attribution.state as "payoutState",
              attribution.amount_minor as "payoutAmountMinor",
              attribution.paid_at as "payoutPaidAt"
       from orders o
       left join payout_availabilities a on a.order_id = o.id
       left join lateral (
         select payout.public_id as payout_public_id,
                payout.state as state,
                payout.paid_at as paid_at,
                claimed.amount_minor as amount_minor
         from (
           select pl.payout_id as payout_id,
                  pl.amount_minor as amount_minor
           from payout_lines pl
           join payouts paid
             on paid.id = pl.payout_id
            and paid.state = 'paid'
           where pl.order_id = o.id
           union all
           select pending.id as payout_id,
                  (allocation.value ->> 'amountMinor')::int as amount_minor
           from payouts pending
           cross join lateral jsonb_array_elements(
             coalesce(pending.claimed_allocations, '[]'::jsonb)
           ) allocation
           where pending.state = 'pending'
             and allocation.value ->> 'orderId' = o.id::text
         ) claimed
         join payouts payout on payout.id = claimed.payout_id
         order by payout.created_at desc, payout.id desc
         limit 1
       ) attribution on true
       where o.id = ?`,
      [orderId],
    );

    return rows[0] ? toOrderPayoutFacts(rows[0]) : null;
  }

  private getEntityManager(context?: FinanceRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
