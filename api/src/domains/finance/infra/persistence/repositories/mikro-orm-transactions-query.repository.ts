import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { PayoutSource } from '../../../domain/rules/payout';
import { ORDER_PAID_MONEY_EVENT_NAME } from '../../../app/ports/order-paid-money-event';
import { ORDER_REFUND_MONEY_EVENT_NAME } from '../../../app/ports/order-refund-money-event';
import {
  TransactionsQueryRepository,
  type ListShopTransactionsQuery,
  type ShopTransactionsPage,
  type TransactionRecord,
  type TransactionStatus,
  type TransactionType,
} from '../../../app/ports/transactions-query.repository';

/** One row of the unioned transaction timeline, as Postgres returns it. */
interface TransactionRow {
  id: string;
  occurred_at: Date;
  reference: string;
  order_number: string | null;
  payout_number: string | null;
  type: TransactionType;
  status: TransactionStatus;
  order_amount_minor: number | string | null;
  fees_minor: number | string | null;
  net_amount_minor: number | string;
  currency: string;
  source: PayoutSource | null;
}

/**
 * Builds the transaction timeline from the facts Finance already recorded:
 *
 * - Order income is the Seller Payable credit on the Order's `order.paid`
 *   Journal Entry. It is `released` only when the whole Order's Payout
 *   Availability is recorded, and `pending` otherwise, so a partially released
 *   Order still reads as pending.
 * - A Refund is the (negative) Seller Payable Posting on its `order.refunded`
 *   Journal Entry, and is always `deducted`.
 * - A Payout is the Payout fact itself, negative in signed terms, carrying its
 *   own state and source.
 *
 * Each Order row also carries its gross Order amount (the negated Platform
 * Clearing Posting) and its Platform Commission (the negated commission
 * Posting), so `order_amount_minor + fees_minor = net_amount_minor` holds on
 * every Order row. A historical Entry without a commission Posting still lists,
 * with a zero fee. Payout rows leave both null.
 *
 * Amounts are read as recorded, never re-converted at read time. The reference
 * is the Order public id for income and refunds and the human Payout number for
 * payouts.
 */
@Injectable()
export class MikroOrmTransactionsQueryRepository
implements TransactionsQueryRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findPage(query: ListShopTransactionsQuery): Promise<ShopTransactionsPage> {
    const params: unknown[] = [
      query.shopId,
      ORDER_PAID_MONEY_EVENT_NAME,
      query.shopId,
      ORDER_REFUND_MONEY_EVENT_NAME,
      query.shopId,
    ];
    const conditions: string[] = [];

    if (query.type) {
      conditions.push('t.type = ?');
      params.push(query.type);
    }

    if (query.status) {
      conditions.push('t.status = ?');
      params.push(query.status);
    }

    if (query.dateFrom) {
      conditions.push('t.occurred_at >= ?');
      params.push(query.dateFrom);
    }

    if (query.dateTo) {
      conditions.push('t.occurred_at <= ?');
      params.push(query.dateTo);
    }

    const whereClause = conditions.length > 0
      ? `where ${conditions.join(' and ')}`
      : '';

    const transactionsCte = `with transactions as (
         select je.id as id,
                je.occurred_at as occurred_at,
                o.public_id as reference,
                o.order_number as order_number,
                null::text as payout_number,
                'order_income'::text as type,
                (case when pa.id is null then 'pending' else 'released' end)::text as status,
                -coalesce(clearing_posting.amount_minor, 0) as order_amount_minor,
                coalesce(-commission_posting.amount_minor, 0) as fees_minor,
                p.amount_minor as net_amount_minor,
                je.currency as currency,
                null::text as source
         from journal_entries je
         join postings p on p.journal_entry_id = je.id
         join ledger_accounts la
           on la.id = p.ledger_account_id
          and la.kind = 'seller_payable'
         left join postings commission_posting
           on commission_posting.journal_entry_id = je.id
          and commission_posting.ledger_account_id in (
            select id from ledger_accounts where kind = 'platform_commission'
          )
         left join postings clearing_posting
           on clearing_posting.journal_entry_id = je.id
          and clearing_posting.ledger_account_id in (
            select id from ledger_accounts where kind = 'platform_clearing'
          )
         join orders o on o.id = split_part(je.money_event_key, ':', 2)::uuid
         left join payout_availabilities pa on pa.order_id = o.id
         where je.shop_id = ?
           and je.money_event_kind = ?

         union all

         select je.id as id,
                je.occurred_at as occurred_at,
                o.public_id as reference,
                o.order_number as order_number,
                null::text as payout_number,
                'refund'::text as type,
                'deducted'::text as status,
                -coalesce(clearing_posting.amount_minor, 0) as order_amount_minor,
                coalesce(-commission_posting.amount_minor, 0) as fees_minor,
                p.amount_minor as net_amount_minor,
                je.currency as currency,
                null::text as source
         from journal_entries je
         join postings p on p.journal_entry_id = je.id
         join ledger_accounts la
           on la.id = p.ledger_account_id
          and la.kind = 'seller_payable'
         left join postings commission_posting
           on commission_posting.journal_entry_id = je.id
          and commission_posting.ledger_account_id in (
            select id from ledger_accounts where kind = 'platform_commission'
          )
         left join postings clearing_posting
           on clearing_posting.journal_entry_id = je.id
          and clearing_posting.ledger_account_id in (
            select id from ledger_accounts where kind = 'platform_clearing'
          )
         join orders o on o.id = split_part(je.money_event_key, ':', 2)::uuid
         where je.shop_id = ?
           and je.money_event_kind = ?

         union all

         select po.id as id,
                po.created_at as occurred_at,
                po.payout_number as reference,
                null::text as order_number,
                po.payout_number as payout_number,
                'payout'::text as type,
                po.state::text as status,
                null::int as order_amount_minor,
                null::int as fees_minor,
                -po.amount_minor as net_amount_minor,
                po.currency as currency,
                po.source::text as source
         from payouts po
         where po.shop_id = ?
       )`;

    const offset = (query.page - 1) * query.limit;

    const [rows, countRows] = await Promise.all([
      this.entityManager.execute<TransactionRow[]>(
        `${transactionsCte}
         select t.id, t.occurred_at, t.reference, t.order_number, t.payout_number,
                t.type, t.status,
                t.order_amount_minor, t.fees_minor, t.net_amount_minor,
                t.currency, t.source
         from transactions t
         ${whereClause}
         order by t.occurred_at desc, t.id desc
         limit ? offset ?`,
        [...params, query.limit, offset],
      ),
      this.entityManager.execute<Array<{ total: number | string }>>(
        `${transactionsCte}
         select count(*)::int as total
         from transactions t
         ${whereClause}`,
        params,
      ),
    ]);

    return {
      transactions: rows.map((row) => this.toRecord(row)),
      totalResults: Number(countRows[0]?.total ?? 0),
    };
  }

  private toRecord(row: TransactionRow): TransactionRecord {
    return {
      id: row.id,
      occurredAt: new Date(row.occurred_at),
      reference: row.reference,
      orderNumber: row.order_number,
      payoutNumber: row.payout_number,
      type: row.type,
      status: row.status,
      orderAmountMinor: row.order_amount_minor === null
        ? null
        : Number(row.order_amount_minor),
      feesMinor: row.fees_minor === null ? null : Number(row.fees_minor),
      netAmountMinor: Number(row.net_amount_minor),
      currency: row.currency,
      source: row.source,
    };
  }
}
