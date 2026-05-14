import { Migration } from '@mikro-orm/migrations';

export class Migration20260514000100 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "shops" add column "public_id" varchar(12) null;`);
    this.addSql(`alter table "products" add column "public_id" varchar(12) null;`);

    this.addSql(`update "shops" set "public_id" = substring(replace("id"::text, '-', '') from 1 for 12) where "public_id" is null;`);
    this.addSql(`update "products" set "public_id" = substring(replace("id"::text, '-', '') from 1 for 12) where "public_id" is null;`);

    this.addSql(`alter table "shops" alter column "public_id" set not null;`);
    this.addSql(`alter table "products" alter column "public_id" set not null;`);

    this.addSql(`alter table "shops" add constraint "shops_public_id_unique" unique ("public_id");`);
    this.addSql(`alter table "products" add constraint "products_public_id_unique" unique ("public_id");`);
    this.addSql(`create index "shops_public_id_index" on "shops" ("public_id");`);
    this.addSql(`create index "products_public_id_index" on "products" ("public_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "shops_public_id_index";`);
    this.addSql(`drop index if exists "products_public_id_index";`);
    this.addSql(`alter table "shops" drop constraint if exists "shops_public_id_unique";`);
    this.addSql(`alter table "products" drop constraint if exists "products_public_id_unique";`);
    this.addSql(`alter table "shops" drop column if exists "public_id";`);
    this.addSql(`alter table "products" drop column if exists "public_id";`);
  }
}
