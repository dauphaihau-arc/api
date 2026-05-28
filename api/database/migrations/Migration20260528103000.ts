import { Migration } from '@mikro-orm/migrations';

export class Migration20260528103000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "checkout_quotes"
      rename column "display_currency" to "presentment_currency";
    `);

    this.addSql(`
      alter table "checkout_quote_items"
      add column if not exists "source_currency" varchar(3) null,
      add column if not exists "unit_price_source_minor" integer null,
      add column if not exists "line_total_source_minor" integer null,
      add column if not exists "checkout_currency" varchar(3) null,
      add column if not exists "unit_price_checkout_minor" integer null,
      add column if not exists "line_total_checkout_minor" integer null;
    `);

    this.addSql(`
      do $$
      begin
        if exists (
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'checkout_quote_items'
            and column_name = 'original_amount_minor'
        ) then
          execute '
            update "checkout_quote_items"
            set
              "source_currency" = coalesce("source_currency", "currency"),
              "unit_price_source_minor" = coalesce("unit_price_source_minor", "original_amount_minor", "unit_price_minor"),
              "line_total_source_minor" = coalesce(
                "line_total_source_minor",
                coalesce("original_amount_minor", "unit_price_minor") * "quantity"
              ),
              "checkout_currency" = coalesce("checkout_currency", "currency"),
              "unit_price_checkout_minor" = coalesce("unit_price_checkout_minor", "unit_price_minor"),
              "line_total_checkout_minor" = coalesce("line_total_checkout_minor", "line_total_minor")
          ';
        else
          execute '
            update "checkout_quote_items"
            set
              "source_currency" = coalesce("source_currency", "currency"),
              "unit_price_source_minor" = coalesce("unit_price_source_minor", "unit_price_minor"),
              "line_total_source_minor" = coalesce(
                "line_total_source_minor",
                "unit_price_minor" * "quantity"
              ),
              "checkout_currency" = coalesce("checkout_currency", "currency"),
              "unit_price_checkout_minor" = coalesce("unit_price_checkout_minor", "unit_price_minor"),
              "line_total_checkout_minor" = coalesce("line_total_checkout_minor", "line_total_minor")
          ';
        end if;
      end
      $$;
    `);

    this.addSql(`
      alter table "checkout_quote_items"
      alter column "source_currency" set not null,
      alter column "unit_price_source_minor" set not null,
      alter column "line_total_source_minor" set not null,
      alter column "checkout_currency" set not null,
      alter column "unit_price_checkout_minor" set not null,
      alter column "line_total_checkout_minor" set not null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "checkout_quote_items"
      drop column if exists "line_total_checkout_minor",
      drop column if exists "unit_price_checkout_minor",
      drop column if exists "checkout_currency",
      drop column if exists "line_total_source_minor",
      drop column if exists "unit_price_source_minor",
      drop column if exists "source_currency";
    `);

    this.addSql(`
      alter table "checkout_quotes"
      rename column "presentment_currency" to "display_currency";
    `);
  }
}
