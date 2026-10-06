import { Migration } from '@mikro-orm/migrations';

/**
 * Clean cutover to order-owned stock reservations.
 *
 * This app has no production traffic, so nothing is drained: any reservation
 * row that still carries quote identity is discarded and the quote columns are
 * dropped outright. A reservation is now identified by exactly one owner, the
 * Order that holds the stock.
 */
export class Migration20261006120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('delete from "checkout_stock_reservations";');
    this.addSql('alter table "checkout_stock_reservations" drop constraint if exists "checkout_stock_reservations_quote_id_foreign";');
    this.addSql('drop index if exists "checkout_stock_reservations_quote_inventory_unique";');
    this.addSql('drop index if exists "checkout_stock_reservations_quote_index";');
    this.addSql('alter table "checkout_stock_reservations" drop column if exists "quote_id";');
    this.addSql('alter table "checkout_stock_reservations" add column "order_id" uuid not null;');
    this.addSql('create index "checkout_stock_reservations_order_id_index" on "checkout_stock_reservations" ("order_id");');
    this.addSql('create unique index "checkout_stock_reservations_order_inventory_unique" on "checkout_stock_reservations" ("order_id", "inventory_id");');

    this.addSql('delete from "inventory_reservations";');
    this.addSql('drop index if exists "inventory_reservations_quote_id_unique";');
    this.addSql('alter table "inventory_reservations" drop column if exists "quote_id";');
    this.addSql('alter table "inventory_reservations" add column "order_id" varchar(255) not null;');
    this.addSql('create unique index "inventory_reservations_order_id_unique" on "inventory_reservations" ("order_id");');

    this.addSql('alter table "checkout_quotes" drop column if exists "reservation_id";');

    this.addSql('drop index if exists "checkout_quotes_invalidated_at_index";');
    this.addSql('alter table "checkout_quotes" drop column if exists "invalidated_at";');
    this.addSql('alter table "checkout_quotes" drop column if exists "invalidated_reason";');
  }

  override async down(): Promise<void> {
    this.addSql('alter table "checkout_quotes" add column "invalidated_at" timestamptz null;');
    this.addSql('alter table "checkout_quotes" add column "invalidated_reason" varchar(100) null;');
    this.addSql('create index "checkout_quotes_invalidated_at_index" on "checkout_quotes" ("invalidated_at") where "invalidated_at" is not null;');
    this.addSql('alter table "checkout_quotes" add column "reservation_id" varchar(255) null;');

    this.addSql('drop index if exists "inventory_reservations_order_id_unique";');
    this.addSql('alter table "inventory_reservations" drop column if exists "order_id";');
    this.addSql('alter table "inventory_reservations" add column "quote_id" varchar(255) not null;');
    this.addSql('create unique index "inventory_reservations_quote_id_unique" on "inventory_reservations" ("quote_id");');

    this.addSql('drop index if exists "checkout_stock_reservations_order_inventory_unique";');
    this.addSql('drop index if exists "checkout_stock_reservations_order_id_index";');
    this.addSql('alter table "checkout_stock_reservations" drop column if exists "order_id";');
    this.addSql('alter table "checkout_stock_reservations" add column "quote_id" uuid not null;');
    this.addSql('create index "checkout_stock_reservations_quote_index" on "checkout_stock_reservations" ("quote_id");');
    this.addSql('create unique index "checkout_stock_reservations_quote_inventory_unique" on "checkout_stock_reservations" ("quote_id", "inventory_id");');
    this.addSql(`
      alter table "checkout_stock_reservations"
      add constraint "checkout_stock_reservations_quote_id_foreign"
      foreign key ("quote_id") references "checkout_quotes" ("id")
      on update cascade on delete cascade;
    `);
  }
}
