import { Migration } from '@mikro-orm/migrations';

export class Migration20260812120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "checkout_quotes"
        add column if not exists "reservation_id" varchar(255) null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "checkout_quotes"
        drop column if exists "reservation_id";
    `);
  }
}
