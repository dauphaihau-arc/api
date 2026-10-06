import { Migration } from '@mikro-orm/migrations';

/**
 * Drops the legacy `product_inventory_reservations` table.
 *
 * Order-owned stock is held in `checkout_stock_reservations` and the remote
 * service's `inventory_reservations`; no runtime code reads or writes the
 * legacy table since the stable product mutation cutover. Its rows were only
 * ever consumed by the one-off reconciliation in Migration20260906120000.
 */
export class Migration20261006140000_drop_legacy_product_inventory_reservations extends Migration {
  override async up(): Promise<void> {
    this.addSql('drop table if exists "product_inventory_reservations" cascade;');
  }

  override async down(): Promise<void> {
    this.addSql(`
      create table "product_inventory_reservations" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "product_inventory_id" uuid not null,
        "order_id" uuid not null,
        "quantity" int not null,
        "reserved_at" timestamptz not null,
        "released_at" timestamptz null,
        constraint "product_inventory_reservations_pkey" primary key ("id")
      );
    `);
    this.addSql('create index "product_inventory_reservations_product_inventory_id_index" on "product_inventory_reservations" ("product_inventory_id");');
    this.addSql('create index "product_inventory_reservations_order_id_index" on "product_inventory_reservations" ("order_id");');
    this.addSql('create index "product_inventory_reservations_released_at_index" on "product_inventory_reservations" ("released_at");');
    this.addSql(`
      alter table "product_inventory_reservations"
      add constraint "product_inventory_reservations_product_inventory_id_foreign"
      foreign key ("product_inventory_id")
      references "product_inventory" ("id")
      on update cascade
      on delete cascade;
    `);
  }
}
