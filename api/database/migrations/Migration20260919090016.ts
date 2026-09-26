import { Migration } from '@mikro-orm/migrations';

/**
 * Introduces the authoritative default seller Stock Pool for existing inventory
 * accounting. Quantities, On-hand Versions, reservation status, and movement
 * history are preserved: the migration copies the current local accounting into
 * one default seller-held pool per Inventory Item and never invents a physical
 * warehouse location.
 *
 * This is the final one-default-pool schema: custody and lifecycle are narrowed
 * to what Seller Fulfillment uses, pool identity is required on local
 * reservations, and movement identity is pool-keyed.
 */
export class Migration20260919090016 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "product_stock_pool" (
        "id" uuid not null,
        "created_at" timestamptz(6) not null,
        "updated_at" timestamptz(6) not null,
        "inventory_id" uuid not null,
        "shop_id" uuid not null,
        "name" varchar(255) not null,
        "custody" text not null default 'seller',
        "is_default" boolean not null default false,
        "lifecycle_state" text not null default 'active',
        "on_hand_quantity" int not null,
        "reserved_quantity" int not null default 0,
        "on_hand_version" int not null default 1,
        "stock" int not null default 0,
        constraint "product_stock_pool_pkey" primary key ("id"),
        constraint "product_stock_pool_custody_check" check ("custody" = 'seller'),
        constraint "product_stock_pool_lifecycle_state_check" check ("lifecycle_state" in ('active', 'removed'))
      );
    `);
    this.addSql('alter table "product_stock_pool" add constraint "product_stock_pool_inventory_id_foreign" foreign key ("inventory_id") references "product_inventory" ("id") on update cascade on delete cascade;');
    this.addSql('alter table "product_stock_pool" add constraint "product_stock_pool_shop_id_foreign" foreign key ("shop_id") references "shops" ("id") on update cascade on delete restrict;');
    this.addSql('create index "product_stock_pool_shop_id_index" on "product_stock_pool" ("shop_id");');
    this.addSql('create index "product_stock_pool_inventory_id_index" on "product_stock_pool" ("inventory_id");');

    // One default seller-held pool per existing Inventory Item, seeded from the
    // current authoritative local accounting. No quantity is reset or multiplied.
    this.addSql(`
      insert into "product_stock_pool" (
        "id", "created_at", "updated_at", "inventory_id", "shop_id", "name",
        "custody", "is_default", "lifecycle_state",
        "on_hand_quantity", "reserved_quantity", "on_hand_version", "stock"
      )
      select
        gen_random_uuid(), now(), now(), inventory."id", inventory."shop_id",
        'Default seller pool', 'seller', true, 'active',
        inventory."on_hand_quantity", inventory."reserved_quantity",
        inventory."on_hand_version",
        greatest(inventory."on_hand_quantity" - inventory."reserved_quantity", 0)
      from "product_inventory" inventory;
    `);

    // Movement identity carries pool identity so retries and asynchronous
    // publication cannot apply one movement twice. The legacy per-Inventory-Item
    // index is retired because the default pool is the only authority.
    this.addSql('alter table "inventory_movements" add column "stock_pool_id" uuid null;');
    this.addSql(`
      update "inventory_movements" movement
      set "stock_pool_id" = pool."id"
      from "product_stock_pool" pool
      where pool."inventory_id" = movement."inventory_id" and pool."is_default" = true;
    `);
    this.addSql('alter table "inventory_movements" add constraint "inventory_movements_stock_pool_id_foreign" foreign key ("stock_pool_id") references "product_stock_pool" ("id") on update cascade on delete restrict;');
    this.addSql('create unique index "inventory_movements_command_pool_kind_unique" on "inventory_movements" ("command_id", "stock_pool_id", "movement_kind") where "command_id" is not null;');
    this.addSql('create index "inventory_movements_stock_pool_id_created_index" on "inventory_movements" ("stock_pool_id", "created_at");');
    this.addSql('drop index if exists "inventory_movements_command_id_inventory_kind_unique";');

    // Local checkout reservations always record the default pool holding the
    // quantity: there is exactly one seller-held pool per Inventory Item.
    this.addSql('alter table "checkout_stock_reservations" add column "stock_pool_id" uuid null;');
    this.addSql(`
      update "checkout_stock_reservations" reservation
      set "stock_pool_id" = pool."id"
      from "product_stock_pool" pool
      where pool."inventory_id" = reservation."inventory_id" and pool."is_default" = true;
    `);
    this.addSql('alter table "checkout_stock_reservations" add constraint "checkout_stock_reservations_stock_pool_id_foreign" foreign key ("stock_pool_id") references "product_stock_pool" ("id") on update cascade on delete restrict;');
    this.addSql('alter table "checkout_stock_reservations" alter column "stock_pool_id" set not null;');

    // Remote reservation items record the pool holding the quantity.
    this.addSql('alter table "inventory_reservation_items" add column "stock_pool_id" uuid null;');
    this.addSql(`
      update "inventory_reservation_items" item
      set "stock_pool_id" = pool."id"
      from "product_stock_pool" pool
      where pool."inventory_id" = item."inventory_id" and pool."is_default" = true;
    `);
    this.addSql('alter table "inventory_reservation_items" add constraint "inventory_reservation_items_stock_pool_id_foreign" foreign key ("stock_pool_id") references "product_stock_pool" ("id") on update cascade on delete restrict;');
    this.addSql('create index "inventory_reservation_items_stock_pool_id_index" on "inventory_reservation_items" ("stock_pool_id");');
  }

  override async down(): Promise<void> {
    throw new Error('Migration20260919090016 is forward-only: existing inventory accounting must remain attributable to its default Stock Pool.');
  }
}
