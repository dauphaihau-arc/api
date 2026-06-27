import { Migration } from '@mikro-orm/migrations';

export class Migration20260627110000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "checkout_stock_reservations" (
        "id" uuid not null default gen_random_uuid(),
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "quote_id" uuid not null,
        "inventory_id" uuid not null,
        "user_id" uuid null,
        "guest_session_id" varchar(255) null,
        "cart_id" varchar(255) not null,
        "quantity" int not null,
        "status" varchar(255) not null default 'active',
        "expires_at" timestamptz not null,
        "consumed_at" timestamptz null,
        "released_at" timestamptz null,
        constraint "checkout_stock_reservations_pkey" primary key ("id")
      );
    `);
    this.addSql('create index "checkout_stock_reservations_quote_index" on "checkout_stock_reservations" ("quote_id");');
    this.addSql('create index "checkout_stock_reservations_cart_id_index" on "checkout_stock_reservations" ("cart_id");');
    this.addSql('create index "checkout_stock_reservations_inventory_status_expires_index" on "checkout_stock_reservations" ("inventory_id", "status", "expires_at");');
    this.addSql('create unique index "checkout_stock_reservations_quote_inventory_unique" on "checkout_stock_reservations" ("quote_id", "inventory_id");');
    this.addSql(`
      alter table "checkout_stock_reservations"
      add constraint "checkout_stock_reservations_quote_id_foreign"
      foreign key ("quote_id")
      references "checkout_quotes" ("id")
      on update cascade
      on delete cascade;
    `);
    this.addSql(`
      alter table "checkout_stock_reservations"
      add constraint "checkout_stock_reservations_inventory_id_foreign"
      foreign key ("inventory_id")
      references "product_inventory" ("id")
      on update cascade
      on delete cascade;
    `);
    this.addSql(`
      alter table "checkout_stock_reservations"
      add constraint "checkout_stock_reservations_user_id_foreign"
      foreign key ("user_id")
      references "users" ("id")
      on update cascade
      on delete cascade;
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "checkout_stock_reservations" cascade;');
  }
}
