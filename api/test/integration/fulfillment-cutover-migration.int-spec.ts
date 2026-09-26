import { MikroORM } from '@mikro-orm/postgresql';
import { Client } from 'pg';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import {
  createTestDatabase,
  dropTestDatabase,
  type TestDatabaseContext,
} from '../support/test-postgres';

jest.setTimeout(120_000);

type MigratedDatabase = {
  testDb: TestDatabaseContext;
  sql: Client;
  orm: MikroORM;
};

async function migrateUp(testDb: TestDatabaseContext): Promise<MikroORM> {
  process.env.DB_HOST = testDb.rootConfig.host;
  process.env.DB_PORT = String(testDb.rootConfig.port);
  process.env.DB_USER = testDb.rootConfig.user;
  process.env.DB_PASSWORD = testDb.rootConfig.password;
  process.env.DB_NAME = testDb.dbName;

  const orm = await MikroORM.init(
    buildDatabaseConfig(process.env, { includeEntityGlobs: true, debug: false }),
  );
  await orm.getMigrator().up();
  return orm;
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

describe('Fulfillment fresh migration chain (integration)', () => {
  let database: MigratedDatabase;

  beforeAll(async () => {
    const testDb = await createTestDatabase('fulfillment_fresh_chain');
    const orm = await migrateUp(testDb);
    const sql = await connect(testDb);
    database = { testDb, sql, orm };
  });

  afterAll(async () => {
    if (!database) return;
    await database.sql.end();
    await database.orm.close(true);
    await dropTestDatabase(database.testDb);
  });

  it('never creates Warehouse, allocation, or standalone Shipping Origin schema', async () => {
    for (const table of ['warehouses', 'fulfillment_allocations', 'shop_shipping_origins']) {
      expect(await tableExists(database.sql, table)).toBe(false);
    }
  });

  it('keeps the historical order and shipment origin evidence columns', async () => {
    expect(await columnNames(database.sql, 'orders')).toContain('shipping_origin_countries');
    expect(await columnNames(database.sql, 'shipments')).toContain('origin_countries');
    // Origin address snapshots are owned by the Shipping Profile work, not the
    // superseded shop-level origin.
    expect(await columnNames(database.sql, 'shipments')).not.toContain('origin_snapshot');
    expect(await columnNames(database.sql, 'shipments')).not.toContain('warehouse_id');
    expect(await columnNames(database.sql, 'fulfillment_groups')).not.toContain('origin_snapshot');
  });

  it('creates the final one-default-pool schema', async () => {
    const poolColumns = await columnNames(database.sql, 'product_stock_pool');
    expect(poolColumns).not.toContain('removed_at');
    expect(poolColumns).not.toContain('warehouse_id');

    const constraints = await database.sql.query<{ conname: string }>(
      `select conname from pg_constraint
       where conrelid = 'public.product_stock_pool'::regclass and contype = 'c'`,
    );
    expect(constraints.rows.map((row) => row.conname).sort()).toEqual([
      'product_stock_pool_custody_check',
      'product_stock_pool_lifecycle_state_check',
    ]);

    const reservationColumns = await database.sql.query<{ is_nullable: string }>(
      `select is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'checkout_stock_reservations'
         and column_name = 'stock_pool_id'`,
    );
    expect(reservationColumns.rows[0]!.is_nullable).toBe('NO');

    const movementIndexes = await indexNames(database.sql, 'inventory_movements');
    expect(movementIndexes).toContain('inventory_movements_command_pool_kind_unique');
    expect(movementIndexes).not.toContain('inventory_movements_command_id_inventory_kind_unique');
  });
});
