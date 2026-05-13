import { Migration } from '@mikro-orm/migrations';

export class Migration20260512000200 extends Migration {
  override async up(): Promise<void> {
    this.addSql('alter table "users" add column "version" int not null default 1;');
  }

  override async down(): Promise<void> {
    this.addSql('alter table "users" drop column "version";');
  }
}
