import { MikroORM } from '@mikro-orm/postgresql';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import {
  createTestDatabase,
  dropTestDatabase,
  type TestDatabaseContext,
} from '../support/test-postgres';

jest.setTimeout(120_000);

const RENAME_MIGRATION = 'Migration20261023101000_rename_seller_payable_balances';
const DROP_TYPE_MIGRATION = 'Migration20261023100000_remove_payout_account_type';

type MigratedDatabase = {
  testDb: TestDatabaseContext;
  sql: Client;
  orm: MikroORM;
};

async function initOrm(testDb: TestDatabaseContext): Promise<MikroORM> {
  process.env.DB_HOST = testDb.rootConfig.host;
  process.env.DB_PORT = String(testDb.rootConfig.port);
  process.env.DB_USER = testDb.rootConfig.user;
  process.env.DB_PASSWORD = testDb.rootConfig.password;
  process.env.DB_NAME = testDb.dbName;

  return MikroORM.init(
    buildDatabaseConfig(process.env, { includeEntityGlobs: true, debug: false }),
  );
}

async function connect(testDb: TestDatabaseContext): Promise<Client> {
  const sql = new Client({
    host: testDb.rootConfig.host,
    port: testDb.rootConfig.port,
    user: testDb.rootConfig.user,
    password: testDb.rootConfig.password,
    database: testDb.dbName,
  });
  await sql.connect();
  return sql;
}

async function tableExists(sql: Client, name: string): Promise<boolean> {
  const result = await sql.query<{ present: boolean }>(
    'select to_regclass($1) is not null as present',
    [`public.${name}`],
  );
  return result.rows[0]!.present;
}

async function columnNames(sql: Client, table: string): Promise<string[]> {
  const result = await sql.query<{ column_name: string }>(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = $1`,
    [table],
  );
  return result.rows.map((row) => row.column_name).sort();
}

async function indexNames(sql: Client, table: string): Promise<string[]> {
  const result = await sql.query<{ indexname: string }>(
    'select indexname from pg_indexes where schemaname = $1 and tablename = $2',
    ['public', table],
  );
  return result.rows.map((row) => row.indexname).sort();
}

describe('Bank-only payout accounts and Seller Payable balance rename (migration)', () => {
  let database: MigratedDatabase;
  let accountId: string;

  beforeAll(async () => {
    const testDb = await createTestDatabase('finance-bank-only');
    const sql = await connect(testDb);
    const orm = await initOrm(testDb);
    database = { testDb, sql, orm };

    // The harness hands back a fully migrated database. Step it back over the
    // two migrations under test so the legacy shape exists to migrate forward.
    await orm.getMigrator().down({ migrations: [RENAME_MIGRATION] });
    await orm.getMigrator().down({ migrations: [DROP_TYPE_MIGRATION] });

    accountId = randomUUID();
    // The shop row is irrelevant to the guards under test, so the throwaway
    // database disables the FK triggers just long enough to insert one legacy
    // row that claims to be a wallet.
    await database.sql.query('alter table "payout_accounts" disable trigger all');
    await database.sql.query(
      `insert into "payout_accounts" (
         "id", "created_at", "updated_at", "shop_id", "type", "provider",
         "provider_ref_encrypted", "holder_name", "bank_name", "country",
         "currency", "last4", "status", "verified_at", "deactivated_at"
       )
       values ($1, now(), now(), $2, 'wallet', 'manual_bank', 'v1:legacy-ciphertext',
               'Legacy Seller', 'Example Bank', 'US', 'USD', '6789', 'active', now(), null)`,
      [accountId, randomUUID()],
    );
    await database.sql.query('alter table "payout_accounts" enable trigger all');
  });

  afterAll(async () => {
    if (database) {
      await database.orm.close(true);
      await database.sql.end();
      await dropTestDatabase(database.testDb);
    }
  });

  it('refuses to drop the type column while a non-bank row remains', async () => {
    await expect(database.orm.getMigrator().up()).rejects.toThrow(
      /payout_accounts has 1 row\(s\) whose type is not 'bank'/,
    );

    expect(await columnNames(database.sql, 'payout_accounts')).toContain('type');
  });

  it('drops the column once every row is a bank account and keeps the row', async () => {
    await database.sql.query(
      'update "payout_accounts" set "type" = $2 where "id" = $1',
      [accountId, 'bank'],
    );

    await database.orm.getMigrator().up();

    const columns = await columnNames(database.sql, 'payout_accounts');
    expect(columns).not.toContain('type');

    const row = await database.sql.query<{ last4: string; holder_name: string }>(
      'select "last4", "holder_name" from "payout_accounts" where "id" = $1',
      [accountId],
    );
    expect(row.rows[0]).toEqual({ last4: '6789', holder_name: 'Legacy Seller' });
  });

  it('renames the projection table and keeps its historical index names', async () => {
    expect(await tableExists(database.sql, 'seller_payable_positions')).toBe(false);
    expect(await tableExists(database.sql, 'seller_payable_balances')).toBe(true);

    const columns = await columnNames(database.sql, 'seller_payable_balances');
    expect(columns).toContain('available_balance_minor');
    expect(columns).toContain('pending_balance_minor');
    expect(columns).not.toContain('available_minor');
    expect(columns).not.toContain('not_yet_available_minor');

    expect(await indexNames(database.sql, 'seller_payable_balances')).toEqual([
      'seller_payable_positions_pkey',
      'seller_payable_positions_shop_id_unique',
    ]);
  });

  it('reverses both migrations', async () => {
    await database.orm.getMigrator().down({ migrations: [RENAME_MIGRATION] });
    expect(await tableExists(database.sql, 'seller_payable_positions')).toBe(true);
    expect(await tableExists(database.sql, 'seller_payable_balances')).toBe(false);

    const columns = await columnNames(database.sql, 'seller_payable_positions');
    expect(columns).toContain('available_minor');
    expect(columns).toContain('not_yet_available_minor');
    expect(columns).not.toContain('available_balance_minor');
    expect(columns).not.toContain('pending_balance_minor');

    await database.orm.getMigrator().down({ migrations: [DROP_TYPE_MIGRATION] });
    expect(await columnNames(database.sql, 'payout_accounts')).toContain('type');

    const row = await database.sql.query<{ type: string }>(
      'select "type" from "payout_accounts" where "id" = $1',
      [accountId],
    );
    expect(row.rows[0]!.type).toBe('bank');
  });
});
