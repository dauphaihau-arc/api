import { Migration } from '@mikro-orm/migrations';

export class Migration20260526193000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('alter table "checkout_quotes" add column "priced_shops" jsonb not null default \'[]\';');
  }

  override async down(): Promise<void> {
    this.addSql('alter table "checkout_quotes" drop column "priced_shops";');
  }
}
