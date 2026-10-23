import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { FinanceRepositoryContext } from '../../../app/ports/finance-repository-context';
import { PayoutQueryRepository } from '../../../app/ports/payout-query.repository';
import type {
  PayableOrderAmount,
  PayableShop,
  PayoutNotificationFacts,
  PayoutRecord,
} from '../../../app/ports/payout.types';
import type { PayoutSource, PayoutState } from '../../../domain/rules/payout';

/** One `payouts` row, as Postgres returns it. */
interface PayoutRow {
  id: string;
  public_id: string;
  payout_number: string;
  amount_minor: number;
  currency: string;
  state: PayoutState;
  source: PayoutSource;
  period_key: string | null;
  reason: string | null;
  provider_reference: string | null;
  paid_at: Date | null;
  created_at: Date;
}

const PAYOUT_COLUMNS = `id, public_id, payout_number, amount_minor, currency, state, source,
       period_key, reason, provider_reference, paid_at, created_at`;

function toPayoutRecord(row: PayoutRow): PayoutRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    payoutNumber: row.payout_number,
    amountMinor: row.amount_minor,
    currency: row.currency,
    state: row.state,
    source: row.source,
    periodKey: row.period_key,
    reason: row.reason,
    providerReference: row.provider_reference,
    paidAt: row.paid_at ? new Date(row.paid_at) : null,
    createdAt: new Date(row.created_at),
  };
}

/**
 * Reads the availability an automatic Payout Run may pay, the Payouts a shop has
 * already been sent, and whether its manual allowance is used. Raw SQL through
 * `entityManager.execute` so a read can join the caller's transaction when one is
 * supplied.
 */
@Injectable()
export class MikroOrmPayoutQueryRepository implements PayoutQueryRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findAutoPayoutShops(
    payoutDayStartUtc: Date,
    context?: FinanceRepositoryContext,
  ): Promise<PayableShop[]> {
    return this.getEntityManager(context).execute<PayableShop[]>(
      `select a.shop_id as "shopId", a.currency as "currency"
       from payout_availabilities a
       join payout_settings s
         on s.shop_id = a.shop_id
        and s.auto_payout_enabled
        and s.auto_payout_enabled_at < ?
       left join lateral (
         select sum(l.amount_minor) as discharged_minor
         from payout_lines l
         where l.order_id = a.order_id
       ) d on true
       where a.amount_minor > coalesce(d.discharged_minor, 0)
       group by a.shop_id, a.currency
       having sum(a.amount_minor - coalesce(d.discharged_minor, 0)) > 0
       order by a.shop_id asc`,
      [payoutDayStartUtc],
    );
  }

  async findPayableOrders(
    shopId: string,
    context?: FinanceRepositoryContext,
  ): Promise<PayableOrderAmount[]> {
    return this.getEntityManager(context).execute<PayableOrderAmount[]>(
      `select a.order_id as "orderId",
              a.amount_minor - coalesce(d.discharged_minor, 0) as "amountMinor"
       from payout_availabilities a
       left join lateral (
         select sum(l.amount_minor) as discharged_minor
         from payout_lines l
         where l.order_id = a.order_id
       ) d on true
       where a.shop_id = ?
         and a.amount_minor > coalesce(d.discharged_minor, 0)
       order by a.delivered_at asc, a.order_id asc`,
      [shopId],
    );
  }

  async hasConsumedManualPayout(
    shopId: string,
    periodKey: string,
    context?: FinanceRepositoryContext,
  ): Promise<boolean> {
    const rows = await this.getEntityManager(context).execute<Array<{ exists: boolean }>>(
      `select exists (
         select 1 from payouts
         where shop_id = ?
           and source = 'manual'
           and period_key = ?
           and quota_consumed
       ) as "exists"`,
      [shopId, periodKey],
    );

    return rows[0]?.exists === true;
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

    return rows.map(toPayoutRecord);
  }

  async findById(
    payoutId: string,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutRecord | null> {
    const rows = await this.getEntityManager(context).execute<PayoutRow[]>(
      `select ${PAYOUT_COLUMNS}
       from payouts
       where id = ?`,
      [payoutId],
    );

    return rows[0] ? toPayoutRecord(rows[0]) : null;
  }

  async findNotificationFacts(
    payoutId: string,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutNotificationFacts | null> {
    const rows = await this.getEntityManager(context).execute<Array<{
      payout_id: string;
      payout_public_id: string;
      payout_number: string;
      payout_amount_minor: number;
      currency: string;
      source: PayoutSource;
      reason: string | null;
      shop_id: string;
      shop_public_id: string;
      shop_name: string;
      recipient_user_id: string | null;
      recipient_email: string | null;
      recipient_display_name: string | null;
    }>>(
      `select p.id as "payout_id",
              p.public_id as "payout_public_id",
              p.payout_number as "payout_number",
              p.amount_minor as "payout_amount_minor",
              p.currency as "currency",
              p.source as "source",
              p.reason as "reason",
              s.id as "shop_id",
              s.public_id as "shop_public_id",
              s.shop_name as "shop_name",
              u.id as "recipient_user_id",
              u.email as "recipient_email",
              u.display_name as "recipient_display_name"
       from payouts p
       join shops s on s.id = p.shop_id
       left join users u on u.id = s.owner_user_id
       where p.id = ?`,
      [payoutId],
    );

    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      payoutId: row.payout_id,
      payoutPublicId: row.payout_public_id,
      payoutNumber: row.payout_number,
      payoutAmountMinor: row.payout_amount_minor,
      currency: row.currency,
      source: row.source,
      reason: row.reason,
      shopId: row.shop_id,
      shopPublicId: row.shop_public_id,
      shopName: row.shop_name,
      recipientUserId: row.recipient_user_id,
      recipientEmail: row.recipient_email,
      recipientDisplayName: row.recipient_display_name,
    };
  }

  private getEntityManager(context?: FinanceRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
