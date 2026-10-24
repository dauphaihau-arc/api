import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { JournalEntry } from '../../../domain/value-objects/journal-entry';
import type { FinanceRepositoryContext } from '../../../app/ports/finance-repository-context';
import {
  JournalEntryRepository,
  type OrderMoneyBasis,
} from '../../../app/ports/journal-entry.repository';
import { paidOrderMoneyEventKey } from '../../../domain/rules/paid-order-postings';
import { ensureLedgerAccountRow } from '../ledger-account';
import { orderRefundMoneyEventKey } from '../../../domain/rules/order-refund-postings';

@Injectable()
export class MikroOrmJournalEntryRepository implements JournalEntryRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async append(
    entry: JournalEntry,
    context: FinanceRepositoryContext,
  ): Promise<boolean> {
    const entityManager = this.getEntityManager(context);
    const now = new Date();

    // `entityManager.execute` (never `getConnection().execute`) so the write
    // joins the caller's transaction. On conflict do nothing rather than
    // catching the unique violation: a Postgres error inside the caller's
    // transaction would abort it.
    const insertedEntries = await entityManager.execute<Array<{ id: string }>>(
      `insert into journal_entries (
         id, money_event_key, money_event_kind, shop_id, currency,
         occurred_at, charge_currency, charge_amount_minor,
         fx_rate, fx_rate_source, fx_rate_effective_at, fx_rate_source_timestamp,
         created_at, updated_at
       )
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict (money_event_key) do nothing
       returning id`,
      [
        randomUUID(),
        entry.moneyEventKey,
        entry.moneyEventKind,
        entry.shopId ?? null,
        entry.currency,
        entry.occurredAt,
        entry.chargeCurrency ?? null,
        entry.chargeAmountMinor ?? null,
        entry.fx?.rate ?? null,
        entry.fx?.source ?? null,
        entry.fx?.effectiveAt ?? null,
        entry.fx?.sourceTimestamp ?? null,
        now,
        now,
      ],
    );

    if (insertedEntries.length === 0) {
      return false;
    }

    const journalEntryId = insertedEntries[0].id;

    for (const posting of entry.postings) {
      const ledgerAccountId = await ensureLedgerAccountRow(
        entityManager,
        posting.account,
        now,
      );

      await entityManager.execute(
        `insert into postings (
           id, journal_entry_id, ledger_account_id, amount_minor,
           created_at, updated_at
         )
         values (?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          journalEntryId,
          ledgerAccountId,
          posting.amountMinor,
          now,
          now,
        ],
      );
    }

    return true;
  }

  async findIdByMoneyEventKey(
    moneyEventKey: string,
    context?: FinanceRepositoryContext,
  ): Promise<string | null> {
    const rows = await this.getEntityManager(context).execute<Array<{ id: string }>>(
      'select "id" from journal_entries where "money_event_key" = ? limit 1',
      [moneyEventKey],
    );

    return rows[0]?.id ?? null;
  }

  async findOrderSellerPayable(
    orderId: string,
    context?: FinanceRepositoryContext,
  ): Promise<{ shopId: string; currency: string; amountMinor: number } | null> {
    // The paid entry carries the Order's shop and Settlement Currency; its
    // refunds are already converted into that same currency, because a shop
    // cannot change currency while any Seller Payable is outstanding. Summing
    // the Seller Payable Postings across both gives what the Order still holds.
    const rows = await this.getEntityManager(context).execute<
      Array<{ shopId: string; currency: string; amountMinor: number | string }>
    >(
      `select je."shop_id" as "shopId", je."currency" as "currency",
              sum(p."amount_minor")::int as "amountMinor"
       from journal_entries je
       join postings p on p."journal_entry_id" = je."id"
       join ledger_accounts la on la."id" = p."ledger_account_id"
       where la."kind" = 'seller_payable'
         and (
           je."money_event_key" = ?
           or je."money_event_key" like ?
         )
       group by je."shop_id", je."currency"
       limit 1`,
      [
        paidOrderMoneyEventKey(orderId),
        `${orderRefundMoneyEventKey(orderId, '')}%`,
      ],
    );

    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      shopId: row.shopId,
      currency: row.currency,
      amountMinor: Number(row.amountMinor),
    };
  }

  async findOrderMoneyBasis(
    orderId: string,
    context?: FinanceRepositoryContext,
  ): Promise<OrderMoneyBasis | null> {
    const rows = await this.getEntityManager(context).execute<
      Array<{
        shopId: string;
        currency: string;
        chargeCurrency: string | null;
        chargeAmountMinor: number | null;
        fxRate: string | null;
        commissionMinor: number | string;
        collectedMinor: number | string;
        occurredAt: Date;
      }>
    >(
      `select je."shop_id" as "shopId", je."currency" as "currency",
              je."charge_currency" as "chargeCurrency",
              je."charge_amount_minor" as "chargeAmountMinor",
              je."fx_rate" as "fxRate",
              je."occurred_at" as "occurredAt",
              coalesce(sum(case when la."kind" = 'platform_commission'
                then p."amount_minor" else 0 end), 0)::int as "commissionMinor",
              coalesce(sum(case when la."kind" = 'platform_clearing'
                then -p."amount_minor" else 0 end), 0)::int as "collectedMinor"
       from journal_entries je
       join postings p on p."journal_entry_id" = je."id"
       join ledger_accounts la on la."id" = p."ledger_account_id"
       where je."money_event_key" = ?
       group by je."id"`,
      [paidOrderMoneyEventKey(orderId)],
    );

    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      shopId: row.shopId,
      currency: row.currency,
      chargeCurrency: row.chargeCurrency ?? undefined,
      chargeAmountMinor: row.chargeAmountMinor ?? undefined,
      fxRate: row.fxRate ?? undefined,
      commissionMinor: Number(row.commissionMinor),
      collectedMinor: Number(row.collectedMinor),
      occurredAt: new Date(row.occurredAt),
    };
  }

  async findOrderRefundChargeAmounts(
    orderId: string,
    context?: FinanceRepositoryContext,
  ): Promise<number[]> {
    const rows = await this.getEntityManager(context).execute<
      Array<{ chargeAmountMinor: number | string }>
    >(
      `select je."charge_amount_minor" as "chargeAmountMinor"
       from journal_entries je
       where je."money_event_key" like ?
         and je."charge_amount_minor" is not null
       order by je."occurred_at" asc, je."id" asc`,
      [`${orderRefundMoneyEventKey(orderId, '')}%`],
    );

    return rows.map((row) => Number(row.chargeAmountMinor));
  }

  private getEntityManager(context?: FinanceRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
