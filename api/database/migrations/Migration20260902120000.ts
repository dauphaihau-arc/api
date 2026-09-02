import { Migration } from '@mikro-orm/migrations';

export class Migration20260902120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      update "variant_prices"
      set "amount_minor" = "original_amount_minor"
      where "original_amount_minor" is not null;
    `);

    this.addSql('alter table "variant_prices" drop column if exists "original_amount_minor";');
  }

  override async down(): Promise<void> {
    this.addSql('alter table "variant_prices" add column if not exists "original_amount_minor" integer null;');
  }
}
