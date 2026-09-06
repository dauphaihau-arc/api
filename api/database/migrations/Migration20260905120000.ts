import { Migration } from '@mikro-orm/migrations';

export class Migration20260905120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('alter table "products" add column if not exists "tags" jsonb not null default \'[]\';');
  }

  override async down(): Promise<void> {
    this.addSql('alter table "products" drop column if exists "tags";');
  }
}
