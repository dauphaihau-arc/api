import { Migration } from '@mikro-orm/migrations';

export class Migration20260601110000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "variant_prices"
      add column if not exists "price_type" varchar(20);
    `);

    this.addSql(`
      update "variant_prices"
      set "price_type" = case
        when "market_code" is null then 'base'
        else 'market'
      end
      where "price_type" is null;
    `);

    this.addSql(`
      alter table "variant_prices"
      alter column "price_type" set not null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "variant_prices"
      drop column if exists "price_type";
    `);
  }
}
