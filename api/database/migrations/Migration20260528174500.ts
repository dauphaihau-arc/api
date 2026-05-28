import { Migration } from '@mikro-orm/migrations';

export class Migration20260528174500 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "order_items"
      add column if not exists "original_amount_minor" integer null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "order_items"
      drop column if exists "original_amount_minor";
    `);
  }
}
