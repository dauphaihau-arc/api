import { Migration } from '@mikro-orm/migrations';

export class Migration20260527173000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "orders"
      add column if not exists "market_code" varchar(20) null,
      add column if not exists "subtotal_minor" int null,
      add column if not exists "shipping_minor" int null,
      add column if not exists "discount_minor" int null,
      add column if not exists "total_minor" int null;
    `);

    this.addSql(`
      alter table "order_items"
      add column if not exists "unit_price_minor" int null,
      add column if not exists "original_amount_minor" int null,
      add column if not exists "line_total_minor" int null,
      add column if not exists "currency" varchar(3) null,
      add column if not exists "source_price_id" uuid null,
      add column if not exists "source_type" varchar(20) null,
      add column if not exists "market_code" varchar(20) null,
      add column if not exists "fx_rate" text null,
      add column if not exists "fx_source" varchar(100) null,
      add column if not exists "fx_effective_at" timestamptz null,
      add column if not exists "fx_source_timestamp" timestamptz null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "order_items"
      drop column if exists "fx_source_timestamp",
      drop column if exists "fx_effective_at",
      drop column if exists "fx_source",
      drop column if exists "fx_rate",
      drop column if exists "market_code",
      drop column if exists "source_type",
      drop column if exists "source_price_id",
      drop column if exists "currency",
      drop column if exists "line_total_minor",
      drop column if exists "original_amount_minor",
      drop column if exists "unit_price_minor";
    `);

    this.addSql(`
      alter table "orders"
      drop column if exists "total_minor",
      drop column if exists "discount_minor",
      drop column if exists "shipping_minor",
      drop column if exists "subtotal_minor",
      drop column if exists "market_code";
    `);
  }
}
