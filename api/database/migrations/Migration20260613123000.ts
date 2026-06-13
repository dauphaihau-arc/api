import { Migration } from '@mikro-orm/migrations';

export class Migration20260613123000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('alter table "categories" add column "featured_facet_keys" jsonb null;');
  }

  override async down(): Promise<void> {
    this.addSql('alter table "categories" drop column "featured_facet_keys";');
  }
}
