import { Migration } from '@mikro-orm/migrations';

export class Migration20260613120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('alter table "category_attributes" add column "key" varchar(255) null;');
    this.addSql(`
      update "category_attributes"
      set "key" = trim(both '_' from regexp_replace(lower(regexp_replace("name", '[^a-zA-Z0-9]+', '_', 'g')), '_+', '_', 'g'))
      where "key" is null;
    `);
    this.addSql('alter table "category_attributes" alter column "key" set not null;');
    this.addSql('alter table "category_attributes" drop constraint if exists "category_attributes_category_id_name_unique";');
    this.addSql('alter table "category_attributes" add constraint "category_attributes_category_id_key_unique" unique ("category_id", "key");');
  }

  override async down(): Promise<void> {
    this.addSql('alter table "category_attributes" drop constraint if exists "category_attributes_category_id_key_unique";');
    this.addSql('alter table "category_attributes" add constraint "category_attributes_category_id_name_unique" unique ("category_id", "name");');
    this.addSql('alter table "category_attributes" drop column "key";');
  }
}
