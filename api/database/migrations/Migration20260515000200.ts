import { Migration } from '@mikro-orm/migrations';

export class Migration20260515000200 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table "user_addresses" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "user_id" uuid not null, "full_name" varchar(255) not null, "address1" varchar(255) not null, "address2" varchar(255) null, "city" varchar(255) not null, "state" varchar(255) not null, "zip" varchar(50) not null, "country" varchar(255) not null, "phone" varchar(50) not null, "is_primary" boolean not null default false, constraint "user_addresses_pkey" primary key ("id"));`);
    this.addSql(`create index "user_addresses_user_id_is_primary_index" on "user_addresses" ("user_id", "is_primary");`);
    this.addSql(`create unique index "user_addresses_unique_primary_per_user" on "user_addresses" ("user_id") where "is_primary" = true;`);
    this.addSql(`alter table "user_addresses" add constraint "user_addresses_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "user_addresses" cascade;`);
  }
}
