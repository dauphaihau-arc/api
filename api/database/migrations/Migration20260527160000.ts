import { Migration } from '@mikro-orm/migrations';

export class Migration20260527160000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "checkout_quotes"
      add column if not exists "market_code" varchar(20) null;
    `);

    this.addSql(`
      alter table "checkout_quote_items"
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
      alter table "checkout_quote_items"
      drop column if exists "fx_source_timestamp",
      drop column if exists "fx_effective_at",
      drop column if exists "fx_source",
      drop column if exists "fx_rate",
      drop column if exists "market_code",
      drop column if exists "source_type",
      drop column if exists "source_price_id";
    `);

    this.addSql(`
      alter table "checkout_quotes"
      drop column if exists "market_code";
    `);
  }
}
