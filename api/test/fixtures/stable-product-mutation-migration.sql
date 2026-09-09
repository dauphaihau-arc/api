-- Load after migrations through Migration20260905120000 and before Migration20260906120000.
-- The _stable_product_mutation_migration_expectations table is consumed by
-- scripts/verify-stable-product-mutation-migration.ts after the cutover migration.

insert into "users" (
  "id",
  "created_at",
  "updated_at",
  "email",
  "display_name",
  "status",
  "email_verified_at"
) values (
  '10000000-0000-4000-8000-000000000001',
  now(),
  now(),
  'migration-seller@example.test',
  'Migration Seller',
  'active',
  now()
) on conflict ("id") do nothing;

insert into "shops" (
  "id",
  "created_at",
  "updated_at",
  "owner_user_id",
  "shop_name",
  "status",
  "public_id",
  "slug"
) values (
  '20000000-0000-4000-8000-000000000001',
  now(),
  now(),
  '10000000-0000-4000-8000-000000000001',
  'migration-fixture',
  'active',
  'migshop00001',
  'migration-fixture'
) on conflict ("id") do nothing;

insert into "products" (
  "id",
  "created_at",
  "updated_at",
  "shop_id",
  "category_id",
  "title",
  "slug",
  "description",
  "state",
  "who_made",
  "is_digital",
  "non_taxable",
  "variant_type",
  "variant_group_name",
  "variant_sub_group_name",
  "views",
  "rating_average",
  "review_count",
  "published_at",
  "public_id",
  "tags"
) values
  (
    '30000000-0000-4000-8000-000000000001',
    now(),
    now(),
    '20000000-0000-4000-8000-000000000001',
    null,
    'Migration Active Product',
    'migration-active-product',
    'Active product for migration verification.',
    'active',
    'i_did',
    false,
    false,
    'single',
    'Color',
    'Size',
    0,
    0,
    0,
    now() - interval '7 days',
    'migprod0001',
    '[]'::jsonb
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    now(),
    now(),
    '20000000-0000-4000-8000-000000000001',
    null,
    'Migration Inactive Product',
    'migration-inactive-product',
    'Inactive product for migration verification.',
    'inactive',
    'i_did',
    false,
    false,
    'none',
    null,
    null,
    0,
    0,
    0,
    null,
    'migprod0002',
    '[]'::jsonb
  ) on conflict ("id") do nothing;

insert into "product_variants" (
  "id",
  "created_at",
  "updated_at",
  "product_id",
  "name",
  "option_value_1",
  "option_value_2",
  "image_storage_key",
  "rank"
) values (
  '40000000-0000-4000-8000-000000000001',
  now(),
  now(),
  '30000000-0000-4000-8000-000000000001',
  'Blue / Small',
  'Blue',
  'Small',
  null,
  1
) on conflict ("id") do nothing;

insert into "product_inventory" (
  "id",
  "created_at",
  "updated_at",
  "shop_id",
  "product_id",
  "product_variant_id",
  "sku",
  "stock"
) values
  (
    '50000000-0000-4000-8000-000000000001',
    now(),
    now(),
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'MIG-ACTIVE-SKU',
    4
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    now(),
    now(),
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    null,
    'MIG-INACTIVE-SKU',
    1
  ) on conflict ("id") do nothing;

insert into "checkout_quotes" (
  "id",
  "actor_type",
  "user_id",
  "guest_session_id",
  "cart_id",
  "presentment_currency",
  "checkout_currency",
  "subtotal_minor",
  "shipping_minor",
  "discount_minor",
  "total_minor",
  "shipping_address",
  "shop_adjustments",
  "expires_at",
  "created_at",
  "updated_at",
  "priced_shops",
  "market_code",
  "quote_fingerprint",
  "reservation_id"
) values
  (
    '60000000-0000-4000-8000-000000000001',
    'guest',
    null,
    'migration-guest-active',
    '70000000-0000-4000-8000-000000000001',
    'USD',
    'USD',
    1200,
    0,
    0,
    1200,
    '{"name":"Migration Guest","line1":"1 Test Way","city":"Testville","country":"US"}'::jsonb,
    null,
    now() + interval '2 hours',
    now(),
    now(),
    '[]'::jsonb,
    'US',
    'fixture-active',
    null
  ),
  (
    '60000000-0000-4000-8000-000000000002',
    'guest',
    null,
    'migration-guest-expired',
    '70000000-0000-4000-8000-000000000002',
    'USD',
    'USD',
    1200,
    0,
    0,
    1200,
    '{"name":"Migration Guest","line1":"1 Test Way","city":"Testville","country":"US"}'::jsonb,
    null,
    now() - interval '2 hours',
    now(),
    now(),
    '[]'::jsonb,
    'US',
    'fixture-expired',
    null
  ) on conflict ("id") do nothing;

insert into "checkout_stock_reservations" (
  "id",
  "created_at",
  "updated_at",
  "quote_id",
  "inventory_id",
  "user_id",
  "guest_session_id",
  "cart_id",
  "quantity",
  "status",
  "expires_at",
  "consumed_at",
  "released_at"
) values
  (
    '80000000-0000-4000-8000-000000000001',
    now(),
    now(),
    '60000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    null,
    'migration-guest-active',
    '70000000-0000-4000-8000-000000000001',
    3,
    'active',
    now() + interval '2 hours',
    null,
    null
  ),
  (
    '80000000-0000-4000-8000-000000000002',
    now(),
    now(),
    '60000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000001',
    null,
    'migration-guest-expired',
    '70000000-0000-4000-8000-000000000002',
    9,
    'active',
    now() - interval '2 hours',
    null,
    null
  ) on conflict ("id") do nothing;

insert into "product_inventory_reservations" (
  "id",
  "created_at",
  "updated_at",
  "product_inventory_id",
  "order_id",
  "quantity",
  "reserved_at",
  "released_at"
) values
  (
    '90000000-0000-4000-8000-000000000001',
    now(),
    now(),
    '50000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    2,
    now() - interval '1 day',
    null
  ),
  (
    '90000000-0000-4000-8000-000000000002',
    now(),
    now(),
    '50000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000002',
    7,
    now() - interval '1 day',
    now()
  ) on conflict ("id") do nothing;

insert into "inventory_reservations" (
  "id",
  "created_at",
  "updated_at",
  "quote_id",
  "cart_id",
  "status",
  "expires_at",
  "idempotency_key"
) values
  (
    'a0000000-0000-4000-8000-000000000001',
    now(),
    now(),
    'remote-active-quote',
    'remote-active-cart',
    'active',
    now() + interval '2 hours',
    'migration-remote-active-key'
  ),
  (
    'a0000000-0000-4000-8000-000000000002',
    now(),
    now(),
    'remote-expired-quote',
    'remote-expired-cart',
    'active',
    now() - interval '2 hours',
    'migration-remote-expired-key'
  ) on conflict ("id") do nothing;

insert into "inventory_reservation_items" (
  "reservation_id",
  "inventory_id",
  "quantity",
  "title"
) values
  (
    'a0000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    1,
    'Remote active reservation'
  ),
  (
    'a0000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000001',
    6,
    'Remote expired reservation'
  ) on conflict ("reservation_id", "inventory_id") do nothing;

insert into "orders" (
  "id",
  "created_at",
  "updated_at",
  "user_id",
  "customer_email",
  "shop_id",
  "payment_type",
  "status",
  "shipping_status",
  "currency",
  "subtotal",
  "total_shipping_fee",
  "total_discount",
  "total",
  "note",
  "promo_codes",
  "shipping_address",
  "shipping_origin_countries",
  "shipping_to_country",
  "shipping_estimated_delivery",
  "payment_details",
  "market_code",
  "subtotal_minor",
  "shipping_minor",
  "discount_minor",
  "total_minor",
  "order_number"
) values (
  'b0000000-0000-4000-8000-000000000001',
  now(),
  now(),
  null,
  'migration-buyer@example.test',
  '20000000-0000-4000-8000-000000000001',
  'card',
  'confirmed',
  'pending',
  'USD',
  12.00,
  0,
  0,
  12.00,
  null,
  '{}',
  '{"name":"Migration Buyer","line1":"1 Test Way","city":"Testville","country":"US"}'::jsonb,
  '{}',
  'US',
  now() + interval '7 days',
  null,
  'US',
  1200,
  0,
  0,
  1200,
  'MIG-ORDER-0001'
) on conflict ("id") do nothing;

insert into "order_items" (
  "id",
  "created_at",
  "updated_at",
  "order_id",
  "product_id",
  "inventory_id",
  "title",
  "image_url",
  "variant_group_name",
  "variant_sub_group_name",
  "variant_name",
  "price",
  "sale_price",
  "quantity",
  "unit_price_minor",
  "original_amount_minor",
  "line_total_minor",
  "currency"
) values (
  'c0000000-0000-4000-8000-000000000001',
  now(),
  now(),
  'b0000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  'Migration Active Product',
  null,
  'Color',
  'Size',
  'Blue / Small',
  12.00,
  null,
  1,
  1200,
  null,
  1200,
  'USD'
) on conflict ("id") do nothing;

create table if not exists "_stable_product_mutation_migration_expectations" (
  "inventory_id" uuid primary key,
  "legacy_stock" integer not null,
  "expected_reserved_quantity" integer not null,
  "order_item_id" uuid null,
  "expect_order_item_sku_null" boolean not null default false,
  "expect_order_item_image_reference_null" boolean not null default false
);

insert into "_stable_product_mutation_migration_expectations" (
  "inventory_id",
  "legacy_stock",
  "expected_reserved_quantity",
  "order_item_id",
  "expect_order_item_sku_null",
  "expect_order_item_image_reference_null"
) values (
  '50000000-0000-4000-8000-000000000001',
  4,
  6,
  'c0000000-0000-4000-8000-000000000001',
  true,
  true
) on conflict ("inventory_id") do update set
  "legacy_stock" = excluded."legacy_stock",
  "expected_reserved_quantity" = excluded."expected_reserved_quantity",
  "order_item_id" = excluded."order_item_id",
  "expect_order_item_sku_null" = excluded."expect_order_item_sku_null",
  "expect_order_item_image_reference_null" = excluded."expect_order_item_image_reference_null";
