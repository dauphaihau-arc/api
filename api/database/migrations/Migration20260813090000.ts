import { Migration } from '@mikro-orm/migrations';

export class Migration20260813090000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`
      create table "inventory_reservations" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "quote_id" varchar(255) not null,
        "cart_id" varchar(255) not null,
        "status" varchar(20) not null,
        "expires_at" timestamptz not null,
        "idempotency_key" varchar(255) not null,
        constraint "inventory_reservations_pkey" primary key ("id")
      );
    `);
    this.addSql('create unique index "inventory_reservations_quote_id_unique" on "inventory_reservations" ("quote_id");');
    this.addSql('create unique index "inventory_reservations_idempotency_key_unique" on "inventory_reservations" ("idempotency_key");');
    this.addSql('create index "inventory_reservations_status_expires_index" on "inventory_reservations" ("status", "expires_at");');

    this.addSql(`
      create table "inventory_reservation_items" (
        "reservation_id" uuid not null,
        "inventory_id" uuid not null,
        "quantity" int not null,
        "title" varchar(255) null,
        constraint "inventory_reservation_items_pkey" primary key ("reservation_id", "inventory_id")
      );
    `);
    this.addSql('create index "inventory_reservation_items_inventory_id_index" on "inventory_reservation_items" ("inventory_id");');
    this.addSql(`
      alter table "inventory_reservation_items"
      add constraint "inventory_reservation_items_reservation_id_foreign"
      foreign key ("reservation_id") references "inventory_reservations" ("id")
      on update cascade on delete cascade;
    `);
    this.addSql(`
      alter table "inventory_reservation_items"
      add constraint "inventory_reservation_items_inventory_id_foreign"
      foreign key ("inventory_id") references "product_inventory" ("id")
      on update cascade on delete restrict;
    `);

    this.addSql(`
      create table "inventory_processed_events" (
        "event_id" varchar(255) not null,
        "reservation_id" uuid not null,
        "processed_at" timestamptz not null,
        constraint "inventory_processed_events_pkey" primary key ("event_id")
      );
    `);
    this.addSql('create index "inventory_processed_events_reservation_id_index" on "inventory_processed_events" ("reservation_id");');
    this.addSql(`
      alter table "inventory_processed_events"
      add constraint "inventory_processed_events_reservation_id_foreign"
      foreign key ("reservation_id") references "inventory_reservations" ("id")
      on update cascade on delete cascade;
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "inventory_processed_events" cascade;');
    this.addSql('drop table if exists "inventory_reservation_items" cascade;');
    this.addSql('drop table if exists "inventory_reservations" cascade;');
  }

}
