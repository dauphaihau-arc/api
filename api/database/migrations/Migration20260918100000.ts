import { Migration } from '@mikro-orm/migrations';

export class Migration20260918100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "orders" add column "fulfillment_status" varchar(30) not null default 'unfulfilled';`);

    // Backfill the aggregate list/filter projection from immutable legacy order-level
    // shipping evidence. No group or Shipment is inferred: order-level tracking does
    // not prove which quantities were in a parcel.
    this.addSql(`
      update "orders"
      set "fulfillment_status" = case
        when "status" = 'canceled' then 'canceled'
        when "shipping_status" = 'in_transit' then 'in_transit'
        when "shipping_status" = 'shipped' then 'in_transit'
        when "shipping_status" = 'delivered' then 'delivered'
        else 'unfulfilled'
      end;
    `);

    this.addSql(`
      create table "fulfillment_groups" (
        "id" uuid not null,
        "created_at" timestamptz(6) not null,
        "updated_at" timestamptz(6) not null,
        "order_id" uuid not null,
        "shop_id" uuid not null,
        "method" varchar(30) not null,
        "operator" varchar(30) not null,
        "provenance" varchar(30) not null,
        "created_by_actor_type" varchar(30) null,
        "created_by_actor_id" varchar(255) null,
        "created_by_source" varchar(255) null,
        constraint "fulfillment_groups_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      create table "fulfillment_group_items" (
        "id" uuid not null,
        "created_at" timestamptz(6) not null,
        "updated_at" timestamptz(6) not null,
        "group_id" uuid not null,
        "order_item_id" uuid not null,
        "quantity" int not null,
        constraint "fulfillment_group_items_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      create table "shipments" (
        "id" uuid not null,
        "created_at" timestamptz(6) not null,
        "updated_at" timestamptz(6) not null,
        "group_id" uuid not null,
        "order_id" uuid not null,
        "shop_id" uuid not null,
        "status" varchar(30) not null,
        "carrier" varchar(255) null,
        "tracking_number" varchar(255) null,
        "note" text null,
        "origin_countries" text[] not null default '{}',
        "prepared_at" timestamptz(6) not null,
        "dispatched_at" timestamptz(6) null,
        "delivered_at" timestamptz(6) null,
        "voided_at" timestamptz(6) null,
        constraint "shipments_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      create table "shipment_items" (
        "id" uuid not null,
        "created_at" timestamptz(6) not null,
        "updated_at" timestamptz(6) not null,
        "shipment_id" uuid not null,
        "order_item_id" uuid not null,
        "quantity" int not null,
        constraint "shipment_items_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      create table "shipment_updates" (
        "id" uuid not null,
        "created_at" timestamptz(6) not null,
        "updated_at" timestamptz(6) not null,
        "shipment_id" uuid not null,
        "status" varchar(30) not null,
        "actor_type" varchar(30) not null,
        "actor_id" varchar(255) null,
        "source" varchar(30) not null,
        "occurred_at" timestamptz(6) not null,
        "note" text null,
        "payload" jsonb null,
        constraint "shipment_updates_pkey" primary key ("id")
      );
    `);

    this.addSql('alter table "fulfillment_group_items" add constraint "fulfillment_group_items_group_id_foreign" foreign key ("group_id") references "fulfillment_groups" ("id") on update cascade on delete cascade;');
    this.addSql('alter table "shipments" add constraint "shipments_group_id_foreign" foreign key ("group_id") references "fulfillment_groups" ("id") on update cascade on delete cascade;');
    this.addSql('alter table "shipment_items" add constraint "shipment_items_shipment_id_foreign" foreign key ("shipment_id") references "shipments" ("id") on update cascade on delete cascade;');
    this.addSql('alter table "shipment_updates" add constraint "shipment_updates_shipment_id_foreign" foreign key ("shipment_id") references "shipments" ("id") on update cascade on delete cascade;');

    this.addSql('alter table "fulfillment_groups" add constraint "fulfillment_groups_order_id_unique" unique ("order_id");');
    this.addSql('create index "fulfillment_groups_shop_id_index" on "fulfillment_groups" ("shop_id");');
    this.addSql('create index "fulfillment_group_items_group_id_index" on "fulfillment_group_items" ("group_id");');
    this.addSql('alter table "fulfillment_group_items" add constraint "fulfillment_group_items_group_id_order_item_id_unique" unique ("group_id", "order_item_id");');
    this.addSql('create index "shipments_group_id_index" on "shipments" ("group_id");');
    this.addSql('create index "shipments_order_id_index" on "shipments" ("order_id");');
    this.addSql('create index "shipment_items_shipment_id_index" on "shipment_items" ("shipment_id");');
    this.addSql('alter table "shipment_items" add constraint "shipment_items_shipment_id_order_item_id_unique" unique ("shipment_id", "order_item_id");');
    this.addSql('create index "shipment_updates_shipment_id_occurred_at_index" on "shipment_updates" ("shipment_id", "occurred_at");');
  }

  override async down(): Promise<void> {
    throw new Error('Migration20260918100000 is forward-only: legacy order-level shipping evidence and the fulfillment assignment cutover must be preserved.');
  }
}
