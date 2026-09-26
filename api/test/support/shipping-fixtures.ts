import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';

type Sql = Pick<Client, 'query'>;

export interface SeedShippingRate {
  destinationScope: 'country' | 'everywhere_else';
  destinationCountry?: string;
  oneItemFeeMinor: number;
  additionalItemFeeMinor: number;
  deliveryTimeMinDays?: number;
  deliveryTimeMaxDays?: number;
}

/**
 * Test fixtures for the reusable Shipping Profile schema. Suites that only need
 * a seeded Product/Shop use these instead of writing the shipping tables
 * directly, so a schema change touches one place.
 */
export async function seedShopShippingProfile(
  sql: Sql,
  input: {
    shopId: string;
    name: string;
    status?: 'draft' | 'active';
    shipFromCountry?: string;
    shipFromPostal?: string;
    processingTimeMinDays?: number;
    processingTimeMaxDays?: number;
    rates?: SeedShippingRate[];
  },
): Promise<string> {
  const shippingProfileId = randomUUID();
  const rates = input.rates ?? [];

  await sql.query(
    `insert into "shipping_profiles"
       ("id", "created_at", "updated_at", "shop_id", "name", "normalized_name", "status", "version", "ship_from_country", "ship_from_postal", "processing_time_min_days", "processing_time_max_days")
     values ($1, now(), now(), $2, $3, $4, $5, 1, $6, $7, $8, $9)`,
    [
      shippingProfileId,
      input.shopId,
      input.name,
      input.name.trim().toLowerCase(),
      input.status ?? 'active',
      input.shipFromCountry ?? 'US',
      input.shipFromPostal ?? '10001',
      input.processingTimeMinDays ?? 1,
      input.processingTimeMaxDays ?? 3,
    ],
  );

  for (const [index, rate] of rates.entries()) {
    await sql.query(
      `insert into "shipping_profile_rates"
         ("id", "created_at", "updated_at", "shipping_profile_id", "position", "destination_scope", "destination_country", "one_item_fee_minor", "additional_item_fee_minor", "delivery_time_min_days", "delivery_time_max_days")
       values ($1, now(), now(), $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        randomUUID(),
        shippingProfileId,
        index + 1,
        rate.destinationScope,
        rate.destinationCountry ?? null,
        rate.oneItemFeeMinor,
        rate.additionalItemFeeMinor,
        rate.deliveryTimeMinDays ?? 3,
        rate.deliveryTimeMaxDays ?? 5,
      ],
    );
  }

  return shippingProfileId;
}

export async function assignProductShippingProfile(
  sql: Sql,
  productId: string,
  shippingProfileId: string | null,
): Promise<void> {
  await sql.query(
    'update "products" set "shipping_profile_id" = $2, "updated_at" = now() where "id" = $1',
    [productId, shippingProfileId],
  );
}

/**
 * Makes an existing Inventory Item publishable: one active default seller Stock
 * Pool, an authoritative on-hand quantity, and a base price in the given
 * currency.
 */
export async function seedPublishableInventory(
  sql: Sql,
  input: {
    shopId: string;
    inventoryId: string;
    sku: string;
    stock: number;
    amountMinor: number;
    currency?: string;
  },
): Promise<void> {
  await sql.query(
    `update "product_inventory"
     set "sku" = $2,
         "stock" = $3,
         "on_hand_quantity" = $3,
         "reserved_quantity" = 0,
         "on_hand_version" = 1,
         "lifecycle_state" = 'active',
         "removed_at" = null,
         "updated_at" = now()
     where "id" = $1`,
    [input.inventoryId, input.sku, input.stock],
  );

  const existingPool = await sql.query<{ id: string }>(
    'select "id" from "product_stock_pool" where "inventory_id" = $1 and "is_default" = true',
    [input.inventoryId],
  );

  if (existingPool.rows.length === 0) {
    await sql.query(
      `insert into "product_stock_pool"
         ("id", "created_at", "updated_at", "inventory_id", "shop_id", "name", "custody", "is_default", "lifecycle_state", "on_hand_quantity", "reserved_quantity", "on_hand_version", "stock")
       values ($1, now(), now(), $2, $3, 'Default seller pool', 'seller', true, 'active', $4, 0, 1, $4)`,
      [randomUUID(), input.inventoryId, input.shopId, input.stock],
    );
  }
  else {
    await sql.query(
      `update "product_stock_pool"
       set "on_hand_quantity" = $2, "reserved_quantity" = 0, "on_hand_version" = 1, "stock" = $2, "updated_at" = now()
       where "id" = $1`,
      [existingPool.rows[0].id, input.stock],
    );
  }

  await sql.query('delete from "variant_prices" where "product_inventory_id" = $1', [
    input.inventoryId,
  ]);
  await sql.query(
    `insert into "variant_prices"
       ("id", "product_inventory_id", "price_type", "market_code", "currency", "amount_minor", "active_from", "created_at", "updated_at")
     values ($1, $2, 'base', null, $3, $4, now(), now(), now())`,
    [randomUUID(), input.inventoryId, input.currency ?? 'USD', input.amountMinor],
  );
}
