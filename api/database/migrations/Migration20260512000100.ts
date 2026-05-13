import { Migration } from '@mikro-orm/migrations';

export class Migration20260512000100 extends Migration {
  override async up(): Promise<void> {
    this.addSql('alter table "users" add column "avatar" varchar(255) null;');
  }

  override async down(): Promise<void> {
    this.addSql('alter table "users" drop column "avatar";');
  }
}
