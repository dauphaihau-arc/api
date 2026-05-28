import { Migration } from '@mikro-orm/migrations';

export class Migration20260526150000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "variant_prices" (
        "id" uuid not null,
        "product_inventory_id" uuid not null,
        "market_code" varchar(20) null,
        "currency" varchar(3) not null,
        "amount_minor" integer not null,
        "original_amount_minor" integer null,
        "active_from" timestamptz not null,
        "active_to" timestamptz null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        constraint "variant_prices_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      alter table "variant_prices"
      add constraint "variant_prices_product_inventory_id_foreign"
      foreign key ("product_inventory_id") references "product_inventory" ("id")
      on update cascade on delete cascade;
    `);

    this.addSql(`
      create index if not exists "variant_prices_inventory_market_code_index"
      on "variant_prices" ("product_inventory_id", "market_code");
    `);

    this.addSql(`
      create unique index if not exists "variant_prices_active_base_unique"
      on "variant_prices" ("product_inventory_id")
      where "market_code" is null and "active_to" is null;
    `);

    this.addSql(`
      create unique index if not exists "variant_prices_active_market_unique"
      on "variant_prices" ("product_inventory_id", "market_code")
      where "market_code" is not null and "active_to" is null;
    `);

    this.addSql(`
      insert into "variant_prices" (
        "id",
        "product_inventory_id",
        "market_code",
        "currency",
        "amount_minor",
        "original_amount_minor",
        "active_from",
        "active_to",
        "created_at",
        "updated_at"
      )
      select
        gen_random_uuid(),
        pi."id",
        null,
        'USD',
        case
          when pi."sale_price" is not null then round((pi."sale_price" * 100))::integer
          else round((pi."price" * 100))::integer
        end,
        case
          when pi."sale_price" is not null then round((pi."price" * 100))::integer
          else null
        end,
        coalesce(pi."updated_at", pi."created_at", now()),
        null,
        coalesce(pi."created_at", now()),
        coalesce(pi."updated_at", now())
      from "product_inventory" pi;
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "variant_prices" cascade;');
  }
}
