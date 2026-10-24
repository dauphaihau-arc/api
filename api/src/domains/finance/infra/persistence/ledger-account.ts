import type { EntityManager } from '@mikro-orm/postgresql';
import { randomUUID } from 'node:crypto';
import type { LedgerAccount } from '../../domain/value-objects/ledger-account';
import { ledgerAccountKey } from '../../domain/value-objects/ledger-account';

/**
 * Resolves the ledger account row for a Posting's account, creating it on
 * first use. Race-safe: the conflict-safe insert then the returned row.
 *
 * `DO UPDATE` rather than `DO NOTHING` so the insert always returns its row:
 * with `DO NOTHING` a concurrent uncommitted insert would leave the select
 * empty. Assigning the column to itself keeps the row unchanged.
 */
export async function ensureLedgerAccountRow(
  entityManager: EntityManager,
  account: LedgerAccount,
  now: Date,
): Promise<string> {
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
      ledgerAccountKey(account),
      account.kind,
      account.currency,
      account.shopId ?? null,
      now,
      now,
    ],
  );

  return rows[0].id;
}
