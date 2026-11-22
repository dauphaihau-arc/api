import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  createTestDatabase,
  dropTestDatabase,
  type TestDatabaseContext,
} from '../support/test-postgres';
import { Migration20261120120000_add_order_language_snapshot } from '../../database/migrations/Migration20261120120000_add_order_language_snapshot';

const ORDER_LANGUAGE_MIGRATION_NAME = 'Migration20261120120000_add_order_language_snapshot';

jest.setTimeout(120_000);

interface SqlCollectingMigration {
  up(): Promise<void>;
  getQueries(): string[];
}

describe('Order Language migration (integration)', () => {
  let testDb: TestDatabaseContext;
  let sql: Client;
  let shopId: string;

  beforeAll(async () => {
    testDb = await createTestDatabase('order_language_migration', { fresh: true });

    sql = new Client({
      host: testDb.rootConfig.host,
      port: testDb.rootConfig.port,
      user: testDb.rootConfig.user,
      password: testDb.rootConfig.password,
      database: testDb.dbName,
    });
    await sql.connect();

    const ownerId = randomUUID();
    await sql.query(
      `insert into "users" ("id", "created_at", "updated_at", "email", "status")
       values ($1, now(), now(), 'legacy-order-language@example.test', 'active')`,
      [ownerId],
    );

    shopId = randomUUID();
    await sql.query(
      `insert into "shops" (
         "id", "created_at", "updated_at", "owner_user_id",
         "public_id", "shop_name", "slug"
       ) values ($1, now(), now(), $2, 'LEGACYORDERLANG', 'legacy-order-language', 'legacy-order-language')`,
      [shopId, ownerId],
    );

    // Reconstruct the pre-migration state so the real migration SQL runs
    // against an Order created before Order Language existed.
    await sql.query(
      'delete from "mikro_orm_migrations" where "name" = $1',
      [ORDER_LANGUAGE_MIGRATION_NAME],
    );
    await sql.query(`
      alter table "orders" drop constraint if exists "orders_language_check";
      alter table "orders" drop column if exists "language";
    `);

    await insertOrder('legacy');
  });

  afterAll(async () => {
    await sql?.end();
    if (testDb) {
      await dropTestDatabase(testDb);
    }
  });

  function insertOrder(
    suffix: string,
    language?: string,
  ): Promise<unknown> {
    const languageColumn = language ? ', "language"' : '';
    const languageValue = language ? ', $6' : '';
    const parameters = [
      randomUUID(),
      `legacy-${suffix}@example.test`,
      shopId,
      `ORD-LEGACY-${suffix.toUpperCase()}`,
      `ORDLEGACY${suffix.toUpperCase()}`.slice(0, 32),
      ...(language ? [language] : []),
    ];

    return sql.query(
      `insert into "orders" (
         "id", "created_at", "updated_at", "customer_email", "shop_id",
         "payment_type", "status", "shipping_status", "currency",
         "subtotal", "subtotal_minor", "shipping_minor", "discount_minor",
         "total", "total_minor", "shipping_address", "shipping_to_country",
         "order_number", "public_id"${languageColumn}
       ) values (
         $1, now(), now(), $2, $3, 'cash', 'pending', 'pre_transit', 'USD',
         10, 1000, 0, 0, 10, 1000, '{}', 'US',
         $4, $5${languageValue}
       )`,
      parameters,
    );
  }

  it('backfills existing Orders to English and keeps English as the column default', async () => {
    const MigrationClass = Migration20261120120000_add_order_language_snapshot as unknown as {
      new (): SqlCollectingMigration;
    };
    const migration = new MigrationClass();
    await migration.up();

    await sql.query('begin');
    try {
      for (const statement of migration.getQueries()) {
        await sql.query(statement);
      }
      await sql.query('commit');
    }
    catch (error) {
      await sql.query('rollback');
      throw error;
    }

    const legacyOrder = await sql.query(
      'select "language" from "orders" where "public_id" = $1',
      ['ORDLEGACYLEGACY'],
    );
    expect(legacyOrder.rows).toEqual([{ language: 'en' }]);

    const languageColumn = await sql.query(`
      select "is_nullable", "column_default"
      from "information_schema"."columns"
      where "table_schema" = 'public'
        and "table_name" = 'orders'
        and "column_name" = 'language'
    `);
    expect(languageColumn.rows).toEqual([{
      is_nullable: 'NO',
      column_default: '\'en\'::character varying',
    }]);

    await insertOrder('default');

    const defaultedOrder = await sql.query(
      'select "language" from "orders" where "public_id" = $1',
      ['ORDLEGACYDEFAULT'],
    );
    expect(defaultedOrder.rows).toEqual([{ language: 'en' }]);

    await expect(insertOrder('unsupported', 'fr')).rejects.toThrow();
  });
});
