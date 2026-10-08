import { MikroORM } from '@mikro-orm/postgresql';
import { Client } from 'pg';
import { buildDatabaseConfig } from '~/platform/config/database.config';
import { createTestDatabase, dropTestDatabase } from '../support/test-postgres';

jest.setTimeout(60_000);

const FULFILLMENT_MIGRATION_NAME = 'Migration20260918100000';

type TestDatabase = {
  dbName: string;
  rootConfig: {
    host: string; port: number; user: string; password: string 
  };
};

type LegacyOrderFixture = {
  id: string;
  orderNumber: string;
  status: string;
  shippingStatus: string;
  trackingNumber?: string;
  shippedAt?: boolean;
  deliveredAt?: boolean;
  canceledAt?: boolean;
  totalMinor: number;
  expectedFulfillmentStatus: string;
};

const LEGACY_ORDERS: LegacyOrderFixture[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    orderNumber: 'LEG-UNSHIPPED',
    status: 'paid',
    shippingStatus: 'pre_transit',
    totalMinor: 1999,
    expectedFulfillmentStatus: 'unfulfilled',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    orderNumber: 'LEG-IN-TRANSIT',
    status: 'paid',
    shippingStatus: 'in_transit',
    trackingNumber: 'LEGACY-IT',
    shippedAt: true,
    totalMinor: 2599,
    expectedFulfillmentStatus: 'in_transit',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    orderNumber: 'LEG-SHIPPED',
    status: 'paid',
    shippingStatus: 'shipped',
    trackingNumber: 'LEGACY-SH',
    shippedAt: true,
    totalMinor: 3999,
    expectedFulfillmentStatus: 'in_transit',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    orderNumber: 'LEG-DELIVERED',
    status: 'completed',
    shippingStatus: 'delivered',
    trackingNumber: 'LEGACY-DL',
    shippedAt: true,
    deliveredAt: true,
    totalMinor: 5099,
    expectedFulfillmentStatus: 'delivered',
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    orderNumber: 'LEG-CANCELED',
    status: 'canceled',
    shippingStatus: 'pre_transit',
    canceledAt: true,
    totalMinor: 899,
    expectedFulfillmentStatus: 'canceled',
  },
];

function daysAgo(days: number): Date {
  return new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
}

function restoreProcessEnv(originalEnv: NodeJS.ProcessEnv) {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

 
describe('Fulfillment migration (integration)', () => {
  let testDb: TestDatabase;
  let sql: Client;
  let originalEnv: NodeJS.ProcessEnv;

  const shopId = '99999999-9999-4999-8999-999999999999';
  const userId = '88888888-8888-4888-8888-888888888888';

  beforeAll(async () => {
    originalEnv = { ...process.env };
    testDb = await createTestDatabase('fulfillment-migration', { fresh: true });

    sql = new Client({
      host: testDb.rootConfig.host,
      port: testDb.rootConfig.port,
      user: testDb.rootConfig.user,
      password: testDb.rootConfig.password,
      database: testDb.dbName,
    });
    await sql.connect();

    // Reconstruct the pre-cutover database state: the fulfillment tables and the
    // aggregate projection must not exist, and the cutover migration must be
    // pending, so the real migration SQL runs against populated legacy data.
    await sql.query(`
      drop table if exists "shipment_updates", "shipment_items", "shipments", "fulfillment_group_items", "fulfillment_groups" cascade;
    `);
    await sql.query('alter table "orders" drop column if exists "fulfillment_status";');
    await sql.query(
      'delete from "mikro_orm_migrations" where "name" = $1',
      [FULFILLMENT_MIGRATION_NAME],
    );

    await sql.query(
      `insert into "users" ("id", "created_at", "updated_at", "email", "display_name", "status")
       values ($1, now(), now(), 'legacy-seller@example.test', 'Legacy Seller', 'active')`,
      [userId],
    );
    await sql.query(
      `insert into "shops" ("id", "created_at", "updated_at", "owner_user_id", "public_id", "shop_name", "slug", "status", "currency")
       values ($1, now(), now(), $2, 'LEGACYSHOP01', 'legacy-shop', 'legacy-shop', 'active', 'USD')`,
      [shopId, userId],
    );

    for (const order of LEGACY_ORDERS) {
      await sql.query(
        `insert into "orders" (
           "id", "created_at", "updated_at", "user_id", "customer_email", "shop_id",
           "payment_type", "status", "shipping_status", "currency",
           "subtotal", "total_shipping_fee", "total_discount", "total",
           "promo_codes", "shipping_address", "shipping_origin_countries",
           "shipping_to_country", "shipping_estimated_delivery",
           "subtotal_minor", "shipping_minor", "discount_minor", "total_minor",
           "order_number", "tracking_number", "shipped_at", "delivered_at", "canceled_at",
           "public_id"
         ) values (
           $1, now(), now(), null, 'legacy-buyer@example.test', $2,
           'card', $3, $4, 'USD',
           10.00, 0, 0, 10.00,
           '{}', '{"full_name":"Legacy Buyer","address1":"1 Old Road","city":"Portland","country":"US","state":"OR","zip":"97201"}', '{US}',
           'US', now() + interval '7 days',
           $5, 0, 0, $5,
           $6, $7, $8, $9, $10, $11
         )`,
        [
          order.id,
          shopId,
          order.status,
          order.shippingStatus,
          order.totalMinor,
          order.orderNumber,
          order.trackingNumber ?? null,
          order.shippedAt ? daysAgo(10) : null,
          order.deliveredAt ? daysAgo(3) : null,
          order.canceledAt ? new Date() : null,
          `ord_${order.id.replace(/-/g, '').slice(0, 12)}`,
        ],
      );
    }

    process.env.DB_HOST = testDb.rootConfig.host;
    process.env.DB_PORT = String(testDb.rootConfig.port);
    process.env.DB_USER = testDb.rootConfig.user;
    process.env.DB_PASSWORD = testDb.rootConfig.password;
    process.env.DB_NAME = testDb.dbName;

    const orm = await MikroORM.init(
      buildDatabaseConfig(process.env, { includeEntityGlobs: true }),
    );

    try {
      await orm.getMigrator().up();
    }
    finally {
      await orm.close(true);
    }
  });

  afterAll(async () => {
    if (sql) {
      await sql.end();
    }

    restoreProcessEnv(originalEnv);

    if (testDb) {
      await dropTestDatabase(testDb);
    }
  });

  it('creates the fulfillment schema without inventing groups or shipments', async () => {
    const tables = await sql.query(
      `select table_name from information_schema.tables
       where table_schema = 'public'
         and table_name in ('fulfillment_groups', 'fulfillment_group_items', 'shipments', 'shipment_items', 'shipment_updates')
       order by table_name`,
    );

    expect(tables.rows.map((row) => row.table_name)).toEqual([
      'fulfillment_group_items',
      'fulfillment_groups',
      'shipment_items',
      'shipment_updates',
      'shipments',
    ]);

    const groups = await sql.query('select count(*)::int as count from "fulfillment_groups"');
    expect(groups.rows[0].count).toBe(0);
  });

  it('backfills the aggregate projection while preserving legacy history and money', async () => {
    for (const order of LEGACY_ORDERS) {
      const row = await sql.query(
        `select "fulfillment_status", "shipping_status", "tracking_number", "shipped_at", "delivered_at", "total_minor", "status", "order_number"
         from "orders" where "id" = $1`,
        [order.id],
      );

      expect(row.rows[0].fulfillment_status).toBe(order.expectedFulfillmentStatus);
      expect(row.rows[0].shipping_status).toBe(order.shippingStatus);
      expect(row.rows[0].tracking_number).toBe(order.trackingNumber ?? null);
      expect(Number(row.rows[0].total_minor)).toBe(order.totalMinor);
      expect(row.rows[0].status).toBe(order.status);
      expect(row.rows[0].order_number).toBe(order.orderNumber);

      if (order.shippedAt) {
        expect(row.rows[0].shipped_at).toBeInstanceOf(Date);
      }
      else {
        expect(row.rows[0].shipped_at).toBeNull();
      }

      if (order.deliveredAt) {
        expect(row.rows[0].delivered_at).toBeInstanceOf(Date);
      }
      else {
        expect(row.rows[0].delivered_at).toBeNull();
      }
    }

    // Ambiguous active legacy orders remain explicit uncertainty: no group or
    // Shipment was inferred from order-level tracking.
    const assignments = await sql.query(
      'select count(*)::int as count from "fulfillment_group_items"',
    );
    expect(assignments.rows[0].count).toBe(0);
  });
});
