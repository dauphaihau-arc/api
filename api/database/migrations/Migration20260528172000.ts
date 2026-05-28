import { Migration } from '@mikro-orm/migrations';

export class Migration20260528172000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "variant_prices"
      add column if not exists "original_amount_minor" integer null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "variant_prices"
      drop column if exists "original_amount_minor";
    `);
  }
}
