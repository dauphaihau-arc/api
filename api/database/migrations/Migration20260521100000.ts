import { Migration } from '@mikro-orm/migrations';

export class Migration20260521100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('alter table "carts" add column "guest_session_id" varchar(255) null;');
    this.addSql('alter table "carts" add column "kind" varchar(50) null;');
    this.addSql('alter table "carts" add column "merged_at" timestamptz null;');
    this.addSql('alter table "carts" add column "expires_at" timestamptz null;');
    this.addSql(`
      update "carts"
      set "kind" = case
        when "is_temp" = true then 'buy_now'
        else 'active'
      end;
    `);
    this.addSql('alter table "carts" alter column "kind" set not null;');
    this.addSql('alter table "carts" alter column "user_id" drop not null;');
    this.addSql('drop index if exists "carts_user_id_is_temp_index";');
    this.addSql('create index "carts_user_id_kind_index" on "carts" ("user_id", "kind");');
    this.addSql('create index "carts_guest_session_id_kind_index" on "carts" ("guest_session_id", "kind");');
    this.addSql(`
      create unique index "carts_user_active_unique"
      on "carts" ("user_id")
      where "user_id" is not null and "kind" = 'active' and "merged_at" is null;
    `);
    this.addSql(`
      create unique index "carts_guest_active_unique"
      on "carts" ("guest_session_id")
      where "guest_session_id" is not null and "kind" = 'active' and "merged_at" is null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop index if exists "carts_guest_active_unique";');
    this.addSql('drop index if exists "carts_user_active_unique";');
    this.addSql('drop index if exists "carts_guest_session_id_kind_index";');
    this.addSql('drop index if exists "carts_user_id_kind_index";');
    this.addSql('create index "carts_user_id_is_temp_index" on "carts" ("user_id", "is_temp");');
    this.addSql('alter table "carts" alter column "user_id" set not null;');
    this.addSql('alter table "carts" drop column "guest_session_id";');
    this.addSql('alter table "carts" drop column "kind";');
    this.addSql('alter table "carts" drop column "merged_at";');
    this.addSql('alter table "carts" drop column "expires_at";');
  }
}
