import 'reflect-metadata';
import { Client } from 'pg';
import { buildDatabaseConfig } from '~/platform/config/database.config';

/**
 * Scoped reset of disposable Promotion-related development data.
 *
 * Boundary (inspected against the live schema, not inferred from the retired
 * coupon model):
 *
 * - `promotions`, `promotion_products`, `promotion_codes`, and
 *   `promotion_usages` are owned by the Promotion model and are deleted here.
 *   The child tables reference `promotions` with `on delete cascade`; they are
 *   still deleted explicitly, in child order, so the row counts are observable.
 * - A committed Order carries Promotion facts in two forms: copied values
 *   (`orders.promo_codes`, per-line discount amounts, and the frozen
 *   shipping-quote snapshot) and the committed-redemption rows in
 *   `promotion_usages` (a foreign key into `promotions`). Deleting a Promotion
 *   would cascade those usage rows away and leave a retained Order without its
 *   committed Promotion identity, so the coordinated dependents are included in
 *   the boundary instead: every Order that carries Promotion provenance
 *   (`promo_codes` non-empty or a `promotion_usages` row) is deleted together
 *   with the rows that hang off it — Fulfillment Groups (and their cascading
 *   Shipments, Shipment Items, Shipment Updates, and Group Items), Order Items,
 *   Order Events, inventory reservations, and `promotion_usages`.
 * - Nothing else is touched: Products, Shops, Users, carts, catalog data, and
 *   Orders that never applied a Promotion are left intact.
 *
 * Run `db:seed:demo` after this script to rebuild the authoritative seeded
 * Promotions and the coordinated demo commerce fixtures that reference them.
 */
const DEPENDENT_ORDER_SELECT = `
  select distinct o.id
  from orders o
  where cardinality(coalesce(o.promo_codes, '{}')) > 0
     or exists (select 1 from promotion_usages u where u.order_id = o.id)
`;

async function main() {
  const config = buildDatabaseConfig(process.env);
  const client =
    typeof config.clientUrl === 'string'
      ? new Client({
        connectionString: config.clientUrl,
        ssl: config.driverOptions?.connection?.ssl,
      })
      : new Client({
        host: process.env.DB_HOST ?? '127.0.0.1',
        port: Number(process.env.DB_PORT ?? 5432),
        user: process.env.DB_USER ?? 'postgres',
        password: process.env.DB_PASSWORD ?? 'postgres',
        database: process.env.DB_NAME ?? 'app',
        ssl: config.driverOptions?.connection?.ssl,
      });

  await client.connect();

  try {
    await client.query('begin');

    const orderIds = (await client.query(DEPENDENT_ORDER_SELECT)).rows.map((row) => row.id);
    console.log(`[reset][promotions] ${orderIds.length} Orders carry Promotion provenance`);

    for (const table of [
      'fulfillment_groups',
      'order_items',
      'order_events',
      'promotion_usages',
    ]) {
      const result = await client.query(
        `delete from "${table}" where order_id = any($1::uuid[])`,
        [orderIds],
      );
      console.log(`[reset][promotions] Deleted ${result.rowCount ?? 0} ${table} rows for those Orders`);
    }

    const orders = await client.query('delete from "orders" where id = any($1::uuid[])', [orderIds]);
    console.log(`[reset][promotions] Deleted ${orders.rowCount ?? 0} dependent Orders`);

    for (const table of ['promotion_usages', 'promotion_codes', 'promotion_products', 'promotions']) {
      const result = await client.query(`delete from "${table}"`);
      console.log(`[reset][promotions] Deleted ${result.rowCount ?? 0} rows from ${table}`);
    }

    await client.query('commit');
    console.log('Promotion development data reset; unrelated data untouched');
  }
  catch (error) {
    await client.query('rollback');
    throw error;
  }
  finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
