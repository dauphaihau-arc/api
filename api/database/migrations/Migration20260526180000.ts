import { Migration } from '@mikro-orm/migrations';

export class Migration20260526180000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "checkout_quotes" (
        "id" uuid not null,
        "actor_type" varchar(20) not null,
        "user_id" uuid null,
        "guest_session_id" varchar(255) null,
        "cart_id" uuid not null,
        "display_currency" varchar(3) null,
        "checkout_currency" varchar(3) not null,
        "subtotal_minor" integer not null,
        "shipping_minor" integer not null default 0,
        "discount_minor" integer not null default 0,
        "total_minor" integer not null,
        "shipping_address" jsonb not null,
        "shop_adjustments" jsonb null,
        "expires_at" timestamptz not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        constraint "checkout_quotes_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      alter table "checkout_quotes"
      add constraint "checkout_quotes_user_id_foreign"
      foreign key ("user_id") references "users" ("id")
      on update cascade on delete cascade;
    `);

    this.addSql(`
      create index if not exists "checkout_quotes_user_id_index"
      on "checkout_quotes" ("user_id");
    `);

    this.addSql(`
      create index if not exists "checkout_quotes_cart_id_index"
      on "checkout_quotes" ("cart_id");
    `);

    this.addSql(`
      create table if not exists "checkout_quote_items" (
        "id" uuid not null,
        "quote_id" uuid not null,
        "inventory_id" uuid not null,
        "title" text not null,
        "image_url" text null,
        "variant_group_name" varchar(100) null,
        "variant_sub_group_name" varchar(100) null,
        "variant_name" varchar(255) null,
        "quantity" integer not null,
        "unit_price_minor" integer not null,
        "original_amount_minor" integer null,
        "line_total_minor" integer not null,
        "currency" varchar(3) not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        constraint "checkout_quote_items_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      alter table "checkout_quote_items"
      add constraint "checkout_quote_items_quote_id_foreign"
      foreign key ("quote_id") references "checkout_quotes" ("id")
      on update cascade on delete cascade;
    `);

    this.addSql(`
      alter table "checkout_quote_items"
      add constraint "checkout_quote_items_inventory_id_foreign"
      foreign key ("inventory_id") references "product_inventory" ("id")
      on update cascade on delete restrict;
    `);

    this.addSql(`
      create index if not exists "checkout_quote_items_quote_id_index"
      on "checkout_quote_items" ("quote_id");
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "checkout_quote_items" cascade;');
    this.addSql('drop table if exists "checkout_quotes" cascade;');
  }
}
