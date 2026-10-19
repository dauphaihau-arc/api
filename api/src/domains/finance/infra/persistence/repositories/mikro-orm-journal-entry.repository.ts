import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { LedgerAccount } from '../../../domain/value-objects/ledger-account';
import { ledgerAccountKey } from '../../../domain/value-objects/ledger-account';
import type { JournalEntry } from '../../../domain/value-objects/journal-entry';
import type { FinanceRepositoryContext } from '../../../app/ports/finance-repository-context';
import { JournalEntryRepository } from '../../../app/ports/journal-entry.repository';

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
        entry.shopId,
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
      const ledgerAccountId = await this.ensureLedgerAccount(
        posting.account,
        entityManager,
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

  async findSellerPayableByMoneyEventKey(
    moneyEventKey: string,
    context?: FinanceRepositoryContext,
  ): Promise<{ shopId: string; currency: string; amountMinor: number } | null> {
    const rows = await this.getEntityManager(context).execute<
      Array<{ shopId: string; currency: string; amountMinor: number }>
    >(
      `select je.shop_id as "shopId", je.currency as "currency",
              p.amount_minor as "amountMinor"
       from journal_entries je
       join postings p on p.journal_entry_id = je.id
       join ledger_accounts la on la.id = p.ledger_account_id
       where je.money_event_key = ?
         and la.kind = 'seller_payable'
       limit 1`,
      [moneyEventKey],
    );

    return rows[0] ?? null;
  }

  /**
   * Resolves the ledger account row for a posting's account, creating it on
   * first posting. Race-safe: the conflict-safe insert then a read by key.
   */
  private async ensureLedgerAccount(
    account: LedgerAccount,
    entityManager: EntityManager,
    now: Date,
  ): Promise<string> {
    const accountKey = ledgerAccountKey(account);

    // `DO UPDATE` rather than `DO NOTHING` so the insert always returns its row:
    // with `DO NOTHING` a concurrent uncommitted insert would leave this select
    // empty. Assigning the column to itself keeps the row unchanged.
    const rows = await entityManager.execute<Array<{ id: string }>>(
      `insert into ledger_accounts (
         id, account_key, kind, currency, shop_id, created_at, updated_at
       )
       values (?, ?, ?, ?, ?, ?, ?)
       on conflict (account_key) do update
       set updated_at = ledger_accounts.updated_at
       returning id`,
      [
        randomUUID(),
        accountKey,
        account.kind,
        account.currency,
        account.shopId ?? null,
        now,
        now,
      ],
    );

    return rows[0].id;
  }

  private getEntityManager(context?: FinanceRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
