import { Client } from 'pg';

interface Failure {
  check: string;
  count: number;
  sample?: unknown[];
}

interface Report {
  ok: boolean;
  checkedAt: string;
  failures: Failure[];
  observations: Record<string, unknown>;
}

const HELP = `Verify stable product mutation inventory migration invariants.

Usage:
  ts-node -r tsconfig-paths/register scripts/verify-stable-product-mutation-migration.ts [--json] [--strict-legacy-snapshot-null]

Connection uses DATABASE_URL or DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME.

Load test/fixtures/stable-product-mutation-migration.sql before Migration20260906120000 to exercise exact stock-to-on_hand fixture expectations.
`;


function buildClient(): Client {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (connectionString) {
    return new Client({ connectionString });
  }

  return new Client({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'app',
  });
}

async function relationExists(client: Client, relationName: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `
      select exists (
        select 1
        from pg_class relation
        join pg_namespace namespace
          on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = $1
      ) as "exists";
    `,
    [relationName],
  );

  return result.rows[0]?.exists ?? false;
}

async function tableColumnExists(
  client: Client,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `
      select exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = $1
          and column_name = $2
      ) as "exists";
    `,
    [tableName, columnName],
  );

  return result.rows[0]?.exists ?? false;
}

async function collectFailure(
  client: Client,
  check: string,
  sql: string,
): Promise<Failure | undefined> {
  const countResult = await client.query<{ count: string }>(
    `select count(*)::text as "count" from (${sql}) migration_check;`,
  );
  const count = Number(countResult.rows[0]?.count ?? 0);

  if (count === 0) {
    return undefined;
  }

  const sampleResult = await client.query(`${sql} limit 10;`);

  return {
    check,
    count,
    sample: sampleResult.rows,
  };
}

async function scalarNumber(client: Client, sql: string): Promise<number> {
  const result = await client.query<{ value: string }>(sql);

  return Number(result.rows[0]?.value ?? 0);
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(HELP);
    return;
  }

  const strictLegacySnapshotNull = process.argv.includes('--strict-legacy-snapshot-null');
  const jsonOutput = process.argv.includes('--json');
  const client = buildClient();
  const failures: Failure[] = [];
  const observations: Record<string, unknown> = {};

  await client.connect();

  try {
    const requiredColumns: Array<[string, string]> = [
      ['products', 'product_version'],
      ['products', 'first_published_at'],
      ['product_variants', 'lifecycle_state'],
      ['product_variants', 'removed_at'],
      ['product_inventory', 'on_hand_quantity'],
      ['product_inventory', 'reserved_quantity'],
      ['product_inventory', 'on_hand_version'],
      ['product_inventory', 'lifecycle_state'],
      ['product_inventory', 'removed_at'],
      ['checkout_quote_items', 'sku'],
      ['checkout_quote_items', 'variant_labels'],
      ['checkout_quote_items', 'image_reference'],
      ['checkout_quotes', 'invalidated_at'],
      ['checkout_quotes', 'invalidated_reason'],
      ['order_items', 'sku'],
      ['order_items', 'variant_labels'],
      ['order_items', 'image_reference'],
      ['outbox_events', 'event_key'],
      ['outbox_events', 'occurred_at'],
    ];

    for (const [tableName, columnName] of requiredColumns) {
      if (!(await tableColumnExists(client, tableName, columnName))) {
        failures.push({
          check: `required column ${tableName}.${columnName} exists`,
          count: 1,
        });
      }
    }

    for (const relationName of [
      'inventory_movements',
      'product_inventory_shop_sku_not_removed_unique',
    ]) {
      if (!(await relationExists(client, relationName))) {
        failures.push({
          check: `required relation ${relationName} exists`,
          count: 1,
        });
      }
    }

    const reservationTotalsSql = `
      with active_reservations as (
        select "inventory_id", sum("quantity")::integer as "reserved_quantity"
        from "checkout_stock_reservations"
        where "status" = 'active'
          and "expires_at" > now()
        group by "inventory_id"
        union all
        select "product_inventory_id" as "inventory_id", sum("quantity")::integer as "reserved_quantity"
        from "product_inventory_reservations"
        where "released_at" is null
        group by "product_inventory_id"
        union all
        select item."inventory_id", sum(item."quantity")::integer as "reserved_quantity"
        from "inventory_reservation_items" item
        join "inventory_reservations" reservation
          on reservation."id" = item."reservation_id"
        where reservation."status" = 'active'
          and reservation."expires_at" > now()
        group by item."inventory_id"
      )
      select "inventory_id", sum("reserved_quantity")::integer as "reserved_quantity"
      from active_reservations
      group by "inventory_id"
    `;

    const invariantChecks: Array<[string, string]> = [
      [
        'active reservations map to inventory items',
        `
          select totals."inventory_id"
          from (${reservationTotalsSql}) totals
          left join "product_inventory" inventory
            on inventory."id" = totals."inventory_id"
          where inventory."id" is null
        `,
      ],
      [
        'reserved_quantity equals active reservation quantity',
        `
          select inventory."id", inventory."reserved_quantity", coalesce(totals."reserved_quantity", 0) as "expected_reserved_quantity"
          from "product_inventory" inventory
          left join (${reservationTotalsSql}) totals
            on totals."inventory_id" = inventory."id"
          where inventory."reserved_quantity" <> coalesce(totals."reserved_quantity", 0)
        `,
      ],
      [
        'on_hand_quantity equals legacy stock plus reserved_quantity',
        `
          select "id", "stock", "reserved_quantity", "on_hand_quantity"
          from "product_inventory"
          where "on_hand_quantity" <> "stock" + "reserved_quantity"
        `,
      ],
      [
        'inventory balances and on_hand_version are non-negative',
        `
          select "id", "stock", "on_hand_quantity", "reserved_quantity", "on_hand_version"
          from "product_inventory"
          where "stock" < 0
             or "on_hand_quantity" < 0
             or "reserved_quantity" < 0
             or "on_hand_version" < 1
        `,
      ],
      [
        'SKU uniqueness holds among non-removed inventory items',
        `
          select "shop_id", "sku", count(*)::integer as "item_count"
          from "product_inventory"
          where "sku" is not null
            and "lifecycle_state" <> 'removed'
          group by "shop_id", "sku"
          having count(*) > 1
        `,
      ],
      [
        'published products have a first_published_at marker',
        `
          select "id", "published_at", "first_published_at"
          from "products"
          where "published_at" is not null
            and "first_published_at" is null
        `,
      ],
      [
        'order item variant labels are JSON objects when present',
        `
          select "id", "variant_labels"
          from "order_items"
          where "variant_labels" is not null
            and jsonb_typeof("variant_labels") <> 'object'
        `,
      ],
    ];

    for (const [check, sql] of invariantChecks) {
      const failure = await collectFailure(client, check, sql);

      if (failure) {
        failures.push(failure);
      }
    }

    if (await relationExists(client, '_stable_product_mutation_migration_expectations')) {
      observations.fixtureExpectations = true;

      const fixtureChecks: Array<[string, string]> = [
        [
          'fixture reserved_quantity matches expected active reservations',
          `
            select expected."inventory_id", inventory."reserved_quantity", expected."expected_reserved_quantity"
            from "_stable_product_mutation_migration_expectations" expected
            join "product_inventory" inventory
              on inventory."id" = expected."inventory_id"
            where inventory."reserved_quantity" <> expected."expected_reserved_quantity"
          `,
        ],
        [
          'fixture on_hand_quantity equals legacy stock plus expected reservations',
          `
            select expected."inventory_id", inventory."on_hand_quantity", expected."legacy_stock", expected."expected_reserved_quantity"
            from "_stable_product_mutation_migration_expectations" expected
            join "product_inventory" inventory
              on inventory."id" = expected."inventory_id"
            where inventory."on_hand_quantity" <> expected."legacy_stock" + expected."expected_reserved_quantity"
          `,
        ],
        [
          'fixture keeps historical SKU unknown when expected',
          `
            select expected."order_item_id", order_item."sku"
            from "_stable_product_mutation_migration_expectations" expected
            join "order_items" order_item
              on order_item."id" = expected."order_item_id"
            where expected."expect_order_item_sku_null"
              and order_item."sku" is not null
          `,
        ],
        [
          'fixture keeps historical image reference unknown when expected',
          `
            select expected."order_item_id", order_item."image_reference"
            from "_stable_product_mutation_migration_expectations" expected
            join "order_items" order_item
              on order_item."id" = expected."order_item_id"
            where expected."expect_order_item_image_reference_null"
              and order_item."image_reference" is not null
          `,
        ],
      ];

      for (const [check, sql] of fixtureChecks) {
        const failure = await collectFailure(client, check, sql);

        if (failure) {
          failures.push(failure);
        }
      }
    }
    else {
      observations.fixtureExpectations = false;
    }

    if (strictLegacySnapshotNull) {
      for (const [check, sql] of [
        [
          'legacy order item SKU snapshots stay null',
          'select "id", "sku" from "order_items" where "sku" is not null',
        ],
        [
          'legacy order item image references stay null',
          'select "id", "image_reference" from "order_items" where "image_reference" is not null',
        ],
      ] satisfies Array<[string, string]>) {
        const failure = await collectFailure(client, check, sql);

        if (failure) {
          failures.push(failure);
        }
      }
    }

    observations.inventoryItems = await scalarNumber(
      client,
      'select count(*)::text as "value" from "product_inventory";',
    );
    observations.shortages = await scalarNumber(
      client,
      'select count(*)::text as "value" from "product_inventory" where "on_hand_quantity" < "reserved_quantity";',
    );
    observations.orderItemsWithUnknownSku = await scalarNumber(
      client,
      'select count(*)::text as "value" from "order_items" where "sku" is null;',
    );
    observations.orderItemsWithUnknownImageReference = await scalarNumber(
      client,
      'select count(*)::text as "value" from "order_items" where "image_reference" is null;',
    );

    const report: Report = {
      ok: failures.length === 0,
      checkedAt: new Date().toISOString(),
      failures,
      observations,
    };

    if (jsonOutput) {
      console.log(JSON.stringify(report, null, 2));
    }
    else if (report.ok) {
      console.log('Stable product mutation migration verification passed.');
      console.log(`Inventory items checked: ${observations.inventoryItems}`);
      console.log(`Shortages identified: ${observations.shortages}`);
      console.log(`Order items with unknown SKU: ${observations.orderItemsWithUnknownSku}`);
      console.log(`Order items with unknown image reference: ${observations.orderItemsWithUnknownImageReference}`);
    }
    else {
      console.error('Stable product mutation migration verification failed.');
      console.error(JSON.stringify(report, null, 2));
      process.exitCode = 1;
    }
  }
  finally {
    await client.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
