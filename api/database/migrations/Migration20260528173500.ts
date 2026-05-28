import { Migration } from '@mikro-orm/migrations';

export class Migration20260528173500 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "checkout_quote_items"
      add column if not exists "original_amount_minor" integer null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "checkout_quote_items"
      drop column if exists "original_amount_minor";
    `);
  }
}
