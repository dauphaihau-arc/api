import { Migration } from '@mikro-orm/migrations';

export class Migration20260906120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "products"
        add column if not exists "product_version" integer not null default 1,
        add column if not exists "first_published_at" timestamptz null,
        add column if not exists "removed_at" timestamptz null;
    `);
    this.addSql(`
      update "products"
      set "first_published_at" = coalesce("first_published_at", "published_at", "updated_at")
      where "published_at" is not null;
    `);
    this.addSql(`
      update "products"
      set "removed_at" = coalesce("removed_at", "updated_at")
      where "state" = 'removed'
        and "removed_at" is null;
    `);
    this.addSql('create index if not exists "products_first_published_at_index" on "products" ("first_published_at");');
    this.addSql('create index if not exists "products_removed_at_index" on "products" ("removed_at") where "removed_at" is not null;');


    this.addSql(`
      alter table "product_variants"
        add column if not exists "lifecycle_state" varchar(20) not null default 'active',
        add column if not exists "removed_at" timestamptz null;
    `);
    this.addSql('create index if not exists "product_variants_lifecycle_state_index" on "product_variants" ("lifecycle_state");');
    this.addSql('create index if not exists "product_variants_removed_at_index" on "product_variants" ("removed_at") where "removed_at" is not null;');
    this.addSql('alter table "product_variants" drop constraint if exists "product_variants_product_id_name_unique";');
    this.addSql(`
      create unique index if not exists "product_variants_product_name_not_removed_unique"
      on "product_variants" ("product_id", "name")
      where "lifecycle_state" <> 'removed';
    `);
    this.addSql(`
      alter table "product_variants"
        add constraint "product_variants_lifecycle_state_check"
        check ("lifecycle_state" in ('active', 'inactive', 'removed'));
    `);


    this.addSql(`
      alter table "product_inventory"
        add column if not exists "on_hand_quantity" integer null,
        add column if not exists "reserved_quantity" integer null,
        add column if not exists "on_hand_version" integer not null default 1,
        add column if not exists "lifecycle_state" varchar(20) not null default 'active',
        add column if not exists "removed_at" timestamptz null;
    `);
    this.addSql(`
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
      ), reservation_totals as (
        select "inventory_id", sum("reserved_quantity")::integer as "reserved_quantity"
        from active_reservations
        group by "inventory_id"
      )
      update "product_inventory" inventory
      set "reserved_quantity" = coalesce(reservation_totals."reserved_quantity", 0),
          "on_hand_quantity" = inventory."stock" + coalesce(reservation_totals."reserved_quantity", 0),
          "updated_at" = now()
      from reservation_totals
      where reservation_totals."inventory_id" = inventory."id";
    `);
    this.addSql(`
      update "product_inventory"
      set "reserved_quantity" = 0,
          "on_hand_quantity" = "stock",
          "updated_at" = now()
      where "reserved_quantity" is null
         or "on_hand_quantity" is null;
    `);
    this.addSql(`
      alter table "product_inventory"
        alter column "on_hand_quantity" set not null,
        alter column "reserved_quantity" set not null;
    `);
    this.addSql(`
      alter table "product_inventory"
        add constraint "product_inventory_quantities_non_negative_check"
        check (
          "stock" >= 0
          and "on_hand_quantity" >= 0
          and "reserved_quantity" >= 0
          and "on_hand_version" >= 1
        );
    `);
    this.addSql(`
      alter table "product_inventory"
        add constraint "product_inventory_lifecycle_state_check"
        check ("lifecycle_state" in ('active', 'inactive', 'removed'));
    `);
    this.addSql('create index if not exists "product_inventory_lifecycle_state_index" on "product_inventory" ("lifecycle_state");');
    this.addSql('create index if not exists "product_inventory_removed_at_index" on "product_inventory" ("removed_at") where "removed_at" is not null;');
    this.addSql('create index if not exists "product_inventory_shortage_index" on "product_inventory" ("id") where "on_hand_quantity" < "reserved_quantity";');
    this.addSql(`
      create unique index if not exists "product_inventory_shop_sku_not_removed_unique"
      on "product_inventory" ("shop_id", "sku")
      where "sku" is not null and "lifecycle_state" <> 'removed';
    `);
    this.addSql('alter table "product_inventory" drop constraint if exists "product_inventory_shop_id_sku_unique";');


    this.addSql(`
      create table if not exists "inventory_movements" (
        "id" uuid not null default gen_random_uuid(),
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "inventory_id" uuid not null,
        "movement_kind" varchar(50) not null,
        "quantity_delta" integer not null,
        "on_hand_before" integer not null,
        "on_hand_after" integer not null,
        "reserved_before" integer not null,
        "reserved_after" integer not null,
        "cause" varchar(100) not null,
        "actor_type" varchar(30) null,
        "actor_id" varchar(255) null,
        "command_id" varchar(255) null,
        "event_id" varchar(255) null,
        "note" text null,
        constraint "inventory_movements_pkey" primary key ("id")
      );
    `);
    this.addSql('create index if not exists "inventory_movements_inventory_created_index" on "inventory_movements" ("inventory_id", "created_at");');
    this.addSql('create unique index if not exists "inventory_movements_command_id_inventory_kind_unique" on "inventory_movements" ("command_id", "inventory_id", "movement_kind") where "command_id" is not null;');
    this.addSql('create unique index if not exists "inventory_movements_event_id_unique" on "inventory_movements" ("event_id") where "event_id" is not null;');
    this.addSql(`
      alter table "inventory_movements"
        add constraint "inventory_movements_inventory_id_foreign"
        foreign key ("inventory_id") references "product_inventory" ("id")
        on update cascade on delete restrict;
    `);
    this.addSql(`
      alter table "inventory_movements"
        add constraint "inventory_movements_balances_non_negative_check"
        check (
          "on_hand_before" >= 0
          and "on_hand_after" >= 0
          and "reserved_before" >= 0
          and "reserved_after" >= 0
        );
    `);

    this.addSql(`
      alter table "outbox_events"
        add column if not exists "event_key" varchar(255) null,
        add column if not exists "occurred_at" timestamptz not null default now(),
        add column if not exists "locked_at" timestamptz null,
        add column if not exists "lock_owner" varchar(255) null;
    `);
    this.addSql('update "outbox_events" set "occurred_at" = coalesce("occurred_at", "created_at") where "occurred_at" is null;');
    this.addSql('alter table "outbox_events" alter column "occurred_at" set not null;');
    this.addSql('create unique index if not exists "outbox_events_event_key_unique" on "outbox_events" ("event_key") where "event_key" is not null;');
    this.addSql('create index if not exists "outbox_events_aggregate_index" on "outbox_events" ("aggregate_type", "aggregate_id", "occurred_at");');


    this.addSql(`
      alter table "checkout_quotes"
        add column if not exists "invalidated_at" timestamptz null,
        add column if not exists "invalidated_reason" varchar(100) null;
    `);
    this.addSql('create index if not exists "checkout_quotes_invalidated_at_index" on "checkout_quotes" ("invalidated_at") where "invalidated_at" is not null;');

    this.addSql(`
      alter table "checkout_quote_items"
        add column if not exists "sku" varchar(255) null,
        add column if not exists "variant_labels" jsonb null,
        add column if not exists "image_reference" text null;
    `);

    this.addSql(`
      alter table "order_items"
        add column if not exists "sku" varchar(255) null,
        add column if not exists "variant_labels" jsonb null,
        add column if not exists "image_reference" text null;
    `);
    this.addSql(`
      update "order_items"
      set "variant_labels" = jsonb_strip_nulls(jsonb_build_object(
            'group', "variant_group_name",
            'sub_group', "variant_sub_group_name",
            'name', "variant_name"
          ))
      where "variant_labels" is null
        and (
          "variant_group_name" is not null
          or "variant_sub_group_name" is not null
          or "variant_name" is not null
        );
    `);
    this.addSql('update "order_items" set "image_reference" = "image_url" where "image_reference" is null and "image_url" is not null;');
    this.addSql('create index if not exists "order_items_sku_index" on "order_items" ("sku") where "sku" is not null;');
  }

  override async down(): Promise<void> {
    this.addSql('drop index if exists "order_items_sku_index";');
    this.addSql(`
      alter table "order_items"
        drop column if exists "image_reference",
        drop column if exists "variant_labels",
        drop column if exists "sku";
    `);
    this.addSql(`
      alter table "checkout_quote_items"
        drop column if exists "image_reference",
        drop column if exists "variant_labels",
        drop column if exists "sku";
    `);

    this.addSql('drop index if exists "checkout_quotes_invalidated_at_index";');
    this.addSql(`
      alter table "checkout_quotes"
        drop column if exists "invalidated_reason",
        drop column if exists "invalidated_at";
    `);

    this.addSql('drop index if exists "outbox_events_aggregate_index";');
    this.addSql('drop index if exists "outbox_events_event_key_unique";');
    this.addSql(`
      alter table "outbox_events"
        drop column if exists "lock_owner",
        drop column if exists "locked_at",
        drop column if exists "occurred_at",
        drop column if exists "event_key";
    `);


    this.addSql('alter table "inventory_movements" drop constraint if exists "inventory_movements_balances_non_negative_check";');
    this.addSql('alter table "inventory_movements" drop constraint if exists "inventory_movements_inventory_id_foreign";');
    this.addSql('drop table if exists "inventory_movements" cascade;');

    this.addSql('drop index if exists "product_inventory_shortage_index";');
    this.addSql('drop index if exists "product_inventory_removed_at_index";');
    this.addSql('drop index if exists "product_inventory_lifecycle_state_index";');
    this.addSql('drop index if exists "product_inventory_shop_sku_not_removed_unique";');
    this.addSql('alter table "product_inventory" drop constraint if exists "product_inventory_lifecycle_state_check";');
    this.addSql('alter table "product_inventory" drop constraint if exists "product_inventory_quantities_non_negative_check";');
    this.addSql('alter table "product_inventory" add constraint "product_inventory_shop_id_sku_unique" unique ("shop_id", "sku");');
    this.addSql(`
      alter table "product_inventory"
        drop column if exists "removed_at",
        drop column if exists "lifecycle_state",
        drop column if exists "on_hand_version",
        drop column if exists "reserved_quantity",
        drop column if exists "on_hand_quantity";
    `);

    this.addSql('alter table "product_variants" drop constraint if exists "product_variants_lifecycle_state_check";');
    this.addSql('drop index if exists "product_variants_removed_at_index";');
    this.addSql('drop index if exists "product_variants_lifecycle_state_index";');
    this.addSql(`
      alter table "product_variants"
        drop column if exists "removed_at",
        drop column if exists "lifecycle_state";
    `);

    this.addSql('drop index if exists "products_removed_at_index";');
    this.addSql('drop index if exists "products_first_published_at_index";');
    this.addSql(`
      alter table "products"
        drop column if exists "removed_at",
        drop column if exists "first_published_at",
        drop column if exists "product_version";
    `);
  }
}
