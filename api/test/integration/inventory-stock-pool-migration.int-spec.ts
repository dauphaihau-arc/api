import { randomUUID } from 'node:crypto';
import { MikroORM } from '@mikro-orm/postgresql';
import { Client } from 'pg';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import {
  createTestDatabase,
  dropTestDatabase,
  type TestDatabaseContext,
} from '../support/test-postgres';

const STOCK_POOL_MIGRATION_NAME = 'Migration20260919090016';

jest.setTimeout(120_000);

describe('Inventory stock pool migration (integration)', () => {
  let testDb: TestDatabaseContext;
  let sql: Client;
  let orm: MikroORM;
  let inventoryId: string;

  beforeAll(async () => {
    testDb = await createTestDatabase('inventory_stock_pool_migration');

    sql = new Client({
      host: testDb.rootConfig.host,
      port: testDb.rootConfig.port,
      user: testDb.rootConfig.user,
      password: testDb.rootConfig.password,
      database: testDb.dbName,
    });
    await sql.connect();

    // Reconstruct the pre-cutover state: no Stock Pool schema, and the pool
    // migration pending, so the real migration SQL runs against populated data.
    await sql.query(`
      alter table "inventory_reservation_items" drop constraint if exists "inventory_reservation_items_pkey";
      alter table "inventory_reservation_items" drop constraint if exists "inventory_reservation_items_stock_pool_id_foreign";
      alter table "inventory_reservation_items" drop column if exists "stock_pool_id";
      alter table "inventory_reservation_items" add constraint "inventory_reservation_items_pkey" primary key ("reservation_id", "inventory_id");
      alter table "checkout_stock_reservations" drop constraint if exists "checkout_stock_reservations_stock_pool_id_foreign";
      alter table "checkout_stock_reservations" drop column if exists "stock_pool_id";
      drop index if exists "inventory_movements_stock_pool_id_created_index";
      drop index if exists "inventory_movements_command_pool_kind_unique";
      alter table "inventory_movements" drop constraint if exists "inventory_movements_stock_pool_id_foreign";
      alter table "inventory_movements" drop column if exists "stock_pool_id";
      create unique index if not exists "inventory_movements_command_id_inventory_kind_unique"
        on "inventory_movements" ("command_id", "inventory_id", "movement_kind") where "command_id" is not null;
      drop table if exists "product_stock_pool" cascade;
    `);
    await sql.query(
      'delete from "mikro_orm_migrations" where "name" = $1',
      [STOCK_POOL_MIGRATION_NAME],
    );

    const owner = {
      id: randomUUID(),
    };
    await sql.query(
      `insert into "users" ("id", "created_at", "updated_at", "email", "display_name", "status")
       values ($1, now(), now(), 'legacy-pool@example.test', 'Legacy Seller', 'active')`,
      [owner.id],
    );
    const shopId = randomUUID();
    await sql.query(
      `insert into "shops" ("id", "created_at", "updated_at", "owner_user_id", "public_id", "shop_name", "slug", "status", "currency")
       values ($1, now(), now(), $2, 'LEGACYPOOL1', 'legacy-pool-shop', 'legacy-pool-shop', 'active', 'USD')`,
      [shopId, owner.id],
    );
    const productId = randomUUID();
    await sql.query(
      `insert into "products" (
         "id", "created_at", "updated_at", "shop_id", "title", "slug", "description",
         "state", "who_made", "is_digital", "non_taxable", "tags", "public_sort_prices",
         "views", "rating_average", "review_count", "product_version", "public_id"
       ) values ($1, now(), now(), $2, 'Legacy Product', $3, 'Legacy product', 'draft', 'i_did', false, false, '{}', '{}', 0, 0, 0, 1, $4)`,
      [productId, shopId, `legacy-product-${randomUUID()}`, `PUB${randomUUID().replace(/-/g, '').slice(0, 9).toUpperCase()}`],
    );
    const variantId = randomUUID();
    await sql.query(
      `insert into "product_variants" ("id", "created_at", "updated_at", "product_id", "combination_key", "rank", "lifecycle_state")
       values ($1, now(), now(), $2, '__default__', 1, 'active')`,
      [variantId, productId],
    );
    inventoryId = randomUUID();
    await sql.query(
      `insert into "product_inventory" (
         "id", "created_at", "updated_at", "shop_id", "product_id", "product_variant_id", "sku",
         "stock", "on_hand_quantity", "reserved_quantity", "on_hand_version", "lifecycle_state"
       ) values ($1, now(), now(), $2, $3, $4, 'LEGACY-SKU', 8, 10, 2, 4, 'active')`,
      [inventoryId, shopId, productId, variantId],
    );

    await sql.query(
      `insert into "inventory_movements" (
         "inventory_id", "movement_kind", "quantity_delta", "on_hand_before", "on_hand_after",
         "reserved_before", "reserved_after", "cause", "command_id"
       ) values ($1, 'seller_count', 10, 0, 10, 0, 0, 'product_variant_configuration', 'legacy-count')`,
      [inventoryId],
    );

    const quoteId = randomUUID();
    await sql.query(
      `insert into "checkout_quotes" (
         "id", "actor_type", "cart_id", "checkout_currency", "subtotal_minor", "total_minor",
         "shipping_address", "expires_at", "created_at", "updated_at", "priced_shops"
       ) values ($1, 'guest', $2, 'USD', 0, 0, '{}', now() + interval '30 minutes', now(), now(), '[]')`,
      [quoteId, randomUUID()],
    );
    await sql.query(
      `insert into "checkout_stock_reservations" (
         "created_at", "updated_at", "quote_id", "inventory_id", "cart_id", "quantity", "status", "expires_at"
       ) values (now(), now(), $1, $2, $3, 2, 'active', now() + interval '30 minutes')`,
      [quoteId, inventoryId, randomUUID()],
    );

    const remoteReservationId = randomUUID();
    await sql.query(
      `insert into "inventory_reservations" ("id", "created_at", "updated_at", "quote_id", "cart_id", "status", "expires_at", "idempotency_key")
       values ($1, now(), now(), $2, $3, 'SOLD', now() + interval '30 minutes', $4)`,
      [remoteReservationId, randomUUID(), randomUUID(), `legacy-remote-${randomUUID()}`],
    );
    await sql.query(
      `insert into "inventory_reservation_items" ("reservation_id", "inventory_id", "quantity", "title")
       values ($1, $2, 2, 'Legacy Product')`,
      [remoteReservationId, inventoryId],
    );

    process.env.DB_HOST = testDb.rootConfig.host;
    process.env.DB_PORT = String(testDb.rootConfig.port);
    process.env.DB_USER = testDb.rootConfig.user;
    process.env.DB_PASSWORD = testDb.rootConfig.password;
    process.env.DB_NAME = testDb.dbName;

    orm = await MikroORM.init(
      buildDatabaseConfig(process.env, { includeEntityGlobs: true, debug: false }),
    );

    await orm.getMigrator().up();
  });

  afterAll(async () => {
    if (sql) {
      await sql.end();
    }
    if (orm) {
      await orm.close(true);
    }
    if (testDb) {
      await dropTestDatabase(testDb);
    }
  });

  it('backfills one default seller pool without resetting or multiplying quantities', async () => {
    const pools = await sql.query(
      `select id, is_default, custody, on_hand_quantity, reserved_quantity, on_hand_version
       from product_stock_pool where inventory_id = $1`,
      [inventoryId],
    );
    expect(pools.rows).toHaveLength(1);
    expect(pools.rows[0]).toMatchObject({
      is_default: true,
      custody: 'seller',
      on_hand_quantity: 10,
      reserved_quantity: 2,
      on_hand_version: 4,
    });
    const poolId = pools.rows[0].id as string;

    const inventory = await sql.query(
      'select on_hand_quantity, reserved_quantity, on_hand_version, stock from product_inventory where id = $1',
      [inventoryId],
    );
    expect(inventory.rows[0]).toMatchObject({
      on_hand_quantity: 10,
      reserved_quantity: 2,
      on_hand_version: 4,
      stock: 8,
    });

    const movement = await sql.query(
      'select stock_pool_id from inventory_movements where inventory_id = $1 and command_id = \'legacy-count\'',
      [inventoryId],
    );
    expect(movement.rows[0].stock_pool_id).toBe(poolId);

    const localReservation = await sql.query(
      'select stock_pool_id from checkout_stock_reservations where inventory_id = $1',
      [inventoryId],
    );
    expect(localReservation.rows[0].stock_pool_id).toBe(poolId);

    const remoteItem = await sql.query(
      'select stock_pool_id, quantity from inventory_reservation_items where inventory_id = $1',
      [inventoryId],
    );
    expect(remoteItem.rows[0]).toMatchObject({ stock_pool_id: poolId, quantity: 2 });
  });

  it('keeps Inventory Item, Product Variant, and SKU identity', async () => {
    const inventory = await sql.query(
      'select id, sku, product_variant_id, lifecycle_state from product_inventory where id = $1',
      [inventoryId],
    );
    expect(inventory.rows[0]).toMatchObject({
      id: inventoryId,
      sku: 'LEGACY-SKU',
      lifecycle_state: 'active',
    });
    expect(inventory.rows[0].product_variant_id).toBeTruthy();
  });
});
