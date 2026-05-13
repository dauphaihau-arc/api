import { Migration } from '@mikro-orm/migrations';

export class Migration20260513000100 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table "user_preferences" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "user_id" uuid not null, "region" varchar(100) not null, "language" varchar(10) not null, "currency" varchar(10) not null, constraint "user_preferences_pkey" primary key ("id"));`);
    this.addSql(`alter table "user_preferences" add constraint "user_preferences_user_id_unique" unique ("user_id");`);
    this.addSql(`create index "user_preferences_user_id_index" on "user_preferences" ("user_id");`);
    this.addSql(`alter table "user_preferences" add constraint "user_preferences_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "user_preferences" cascade;`);
  }
}
