import { Migration } from '@mikro-orm/migrations';

export class Migration20260526214500 extends Migration {
  override async up(): Promise<void> {
    this.addSql('alter table "product_inventory" drop column "price";');
    this.addSql('alter table "product_inventory" drop column "sale_price";');
  }

  override async down(): Promise<void> {
    this.addSql('alter table "product_inventory" add column "price" numeric(12,2) not null default 0.5;');
    this.addSql('alter table "product_inventory" add column "sale_price" numeric(12,2) null;');

    this.addSql(`
      update "product_inventory" pi
      set
        "price" = coalesce(vp."original_amount_minor", vp."amount_minor") / 100.0,
        "sale_price" = case
          when vp."original_amount_minor" is not null then vp."amount_minor" / 100.0
          else null
        end
      from "variant_prices" vp
      where vp."product_inventory_id" = pi."id"
        and vp."market_code" is null
        and vp."active_to" is null;
    `);
  }
}
