import { Migration } from '@mikro-orm/migrations';

/**
 * Localized Content stores seller-authored Product and Category text per
 * Storefront Language. English remains on the base tables; a translation row
 * is an optional override and is deleted with its owning record.
 */
export class Migration20261119120000_add_localized_content_translations extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "product_translations" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "product_id" uuid not null,
        "language" varchar(10) not null,
        "title" varchar(255) null,
        "description" text null,
        constraint "product_translations_pkey" primary key ("id"),
        constraint "product_translations_language_check"
          check ("language" in ('en', 'vi'))
      );
    `);

    this.addSql(`
      alter table "product_translations"
        add constraint "product_translations_product_id_language_unique"
        unique ("product_id", "language");
    `);

    this.addSql(`
      alter table "product_translations"
        add constraint "product_translations_product_id_foreign"
        foreign key ("product_id") references "products" ("id")
        on update cascade on delete cascade;
    `);

    this.addSql(`
      create table "category_translations" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "category_id" uuid not null,
        "language" varchar(10) not null,
        "name" varchar(255) null,
        constraint "category_translations_pkey" primary key ("id"),
        constraint "category_translations_language_check"
          check ("language" in ('en', 'vi'))
      );
    `);

    this.addSql(`
      alter table "category_translations"
        add constraint "category_translations_category_id_language_unique"
        unique ("category_id", "language");
    `);

    this.addSql(`
      alter table "category_translations"
        add constraint "category_translations_category_id_foreign"
        foreign key ("category_id") references "categories" ("id")
        on update cascade on delete cascade;
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "product_translations" cascade;');
    this.addSql('drop table if exists "category_translations" cascade;');
  }
}
