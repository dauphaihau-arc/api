import { Migration } from '@mikro-orm/migrations';

export class Migration20260519000200 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "shops" add column "slug" varchar(255) not null;`);
    this.addSql(`update "shops" set "slug" = lower(regexp_replace(trim("shop_name"), '[^a-zA-Z0-9]+', '-', 'g'));`);
    this.addSql(`update "shops" set "slug" = trim(both '-' from "slug");`);
    this.addSql(`alter table "shops" add constraint "shops_slug_unique" unique ("slug");`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "shops" drop constraint if exists "shops_slug_unique";`);
    this.addSql(`alter table "shops" drop column if exists "slug";`);
  }
}
