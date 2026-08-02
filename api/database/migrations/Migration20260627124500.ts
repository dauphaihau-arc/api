import { Migration } from '@mikro-orm/migrations';

export class Migration20260627124500 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      update "orders"
      set
        "subtotal_minor" = coalesce("subtotal_minor", round("subtotal" * case
          when "currency" in ('JPY', 'KRW', 'VND') then 1
          else 100
        end)),
        "shipping_minor" = coalesce("shipping_minor", round("total_shipping_fee" * case
          when "currency" in ('JPY', 'KRW', 'VND') then 1
          else 100
        end)),
        "discount_minor" = coalesce("discount_minor", round("total_discount" * case
          when "currency" in ('JPY', 'KRW', 'VND') then 1
          else 100
        end)),
        "total_minor" = coalesce("total_minor", round("total" * case
          when "currency" in ('JPY', 'KRW', 'VND') then 1
          else 100
        end))
      where
        "subtotal_minor" is null
        or "shipping_minor" is null
        or "discount_minor" is null
        or "total_minor" is null;
    `);

    this.addSql(`
      update "order_items" as oi
      set
        "unit_price_minor" = coalesce(oi."unit_price_minor", round(coalesce(oi."sale_price", oi."price") * case
          when o."currency" in ('JPY', 'KRW', 'VND') then 1
          else 100
        end)),
        "line_total_minor" = coalesce(oi."line_total_minor", round(coalesce(oi."sale_price", oi."price") * case
          when o."currency" in ('JPY', 'KRW', 'VND') then 1
          else 100
        end) * oi."quantity")
      from "orders" as o
      where
        oi."order_id" = o."id"
        and (
          oi."unit_price_minor" is null
          or oi."line_total_minor" is null
        );
    `);

    this.addSql(`
      alter table "orders"
        alter column "subtotal_minor" set not null,
        alter column "shipping_minor" set not null,
        alter column "discount_minor" set not null,
        alter column "total_minor" set not null;
    `);

    this.addSql(`
      alter table "order_items"
        alter column "unit_price_minor" set not null,
        alter column "line_total_minor" set not null;
    `);

    this.addSql(`
      alter table "orders"
        add constraint "orders_minor_amounts_non_negative_check"
        check (
          "subtotal_minor" >= 0
          and "shipping_minor" >= 0
          and "discount_minor" >= 0
          and "total_minor" >= 0
        );
    `);

    this.addSql(`
      alter table "order_items"
        add constraint "order_items_minor_amounts_non_negative_check"
        check (
          "unit_price_minor" >= 0
          and "line_total_minor" >= 0
        );
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "order_items"
        drop constraint if exists "order_items_minor_amounts_non_negative_check";
    `);

    this.addSql(`
      alter table "orders"
        drop constraint if exists "orders_minor_amounts_non_negative_check";
    `);

    this.addSql(`
      alter table "order_items"
        alter column "unit_price_minor" drop not null,
        alter column "line_total_minor" drop not null;
    `);

    this.addSql(`
      alter table "orders"
        alter column "subtotal_minor" drop not null,
        alter column "shipping_minor" drop not null,
        alter column "discount_minor" drop not null,
        alter column "total_minor" drop not null;
    `);
  }
}
