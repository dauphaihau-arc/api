import { Migration } from '@mikro-orm/migrations';

/**
 * Coupons gain the currency their monetary fields (`amount_off`,
 * `min_order_value`) are denominated in.
 *
 * Before this column existed, the stored amounts were compared directly
 * against a checkout-currency subtotal, so a Coupon authored in one currency
 * was accepted or rejected by the raw number regardless of the buyer's
 * checkout currency.
 *
 * The canonical currency is the owning Shop's currency. Existing rows are
 * backfilled from `shops.currency`; no fallback currency is invented, because
 * `coupons.shop_id` is not nullable and references `shops`, so every existing
 * Coupon has exactly one authoritative source currency.
 */
export class Migration20260929130000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('alter table "coupons" add column "currency" varchar(3) null;');
    this.addSql(`
      update "coupons"
      set "currency" = "shops"."currency"
      from "shops"
      where "shops"."id" = "coupons"."shop_id"
        and "coupons"."currency" is null;
    `);
    this.addSql('alter table "coupons" alter column "currency" set not null;');
  }

  override async down(): Promise<void> {
    this.addSql('alter table "coupons" drop column "currency";');
  }
}
