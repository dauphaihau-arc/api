import { Migration } from '@mikro-orm/migrations';

export class Migration20260527190000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      update "orders"
      set
        "subtotal_minor" = round("subtotal" * case
          when "currency" in ('JPY', 'KRW', 'VND') then 1
          else 100
        end),
        "shipping_minor" = round("total_shipping_fee" * case
          when "currency" in ('JPY', 'KRW', 'VND') then 1
          else 100
        end),
        "discount_minor" = round("total_discount" * case
          when "currency" in ('JPY', 'KRW', 'VND') then 1
          else 100
        end),
        "total_minor" = round("total" * case
          when "currency" in ('JPY', 'KRW', 'VND') then 1
          else 100
        end)
      where
        "subtotal_minor" is null
        or "shipping_minor" is null
        or "discount_minor" is null
        or "total_minor" is null;
    `);

    this.addSql(`
      update "order_items" as oi
      set
        "currency" = o."currency",
        "unit_price_minor" = round(coalesce(oi."sale_price", oi."price") * case
          when o."currency" in ('JPY', 'KRW', 'VND') then 1
          else 100
        end),
        "original_amount_minor" = case
          when oi."sale_price" is not null then round(oi."price" * case
            when o."currency" in ('JPY', 'KRW', 'VND') then 1
            else 100
          end)
          else null
        end,
        "line_total_minor" = round(coalesce(oi."sale_price", oi."price") * case
          when o."currency" in ('JPY', 'KRW', 'VND') then 1
          else 100
        end) * oi."quantity"
      from "orders" as o
      where
        oi."order_id" = o."id"
        and (
          oi."currency" is null
          or oi."unit_price_minor" is null
          or oi."line_total_minor" is null
          or (oi."sale_price" is not null and oi."original_amount_minor" is null)
        );
    `);
  }

  override async down(): Promise<void> {
    // irreversible data backfill
  }
}
