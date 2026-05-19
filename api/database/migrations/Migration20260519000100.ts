import { Migration } from '@mikro-orm/migrations';

export class Migration20260519000100 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "shops" add column "description" varchar(255) null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "shops" drop column if exists "description";`);
  }
}
