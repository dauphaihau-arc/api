import { Migration } from '@mikro-orm/migrations';

export class Migration20260525100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "notifications" (
        "id" uuid not null,
        "user_id" uuid not null,
        "type" varchar(100) not null,
        "channel" varchar(20) not null default 'in_app',
        "title" varchar(255) not null,
        "body" text not null,
        "data" jsonb null,
        "read_at" timestamptz null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        constraint "notifications_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      alter table "notifications"
      add constraint "notifications_user_id_foreign"
      foreign key ("user_id") references "users" ("id")
      on update cascade on delete cascade;
    `);

    this.addSql(`
      create index if not exists "notifications_user_created_at_index"
      on "notifications" ("user_id", "created_at");
    `);

    this.addSql(`
      create index if not exists "notifications_user_read_at_index"
      on "notifications" ("user_id", "read_at");
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "notifications" cascade;');
  }
}
