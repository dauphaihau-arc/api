import { Migration } from '@mikro-orm/migrations';

export class Migration20260610001000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "products"
      add column if not exists "public_sort_prices" jsonb null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "products"
      drop column if exists "public_sort_prices";
    `);
  }
}
