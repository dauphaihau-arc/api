import { Migration } from '@mikro-orm/migrations';

export class Migration20260525113000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "web_push_subscriptions" (
        "id" uuid not null,
        "user_id" uuid not null,
        "endpoint" text not null,
        "p256dh" text not null,
        "auth" text not null,
        "user_agent" text null,
        "is_active" boolean not null default true,
        "last_used_at" timestamptz null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        constraint "web_push_subscriptions_pkey" primary key ("id"),
        constraint "web_push_subscriptions_endpoint_unique" unique ("endpoint")
      );
    `);

    this.addSql(`
      alter table "web_push_subscriptions"
      add constraint "web_push_subscriptions_user_id_foreign"
      foreign key ("user_id") references "users" ("id")
      on update cascade on delete cascade;
    `);

    this.addSql(`
      create index if not exists "web_push_subscriptions_user_active_index"
      on "web_push_subscriptions" ("user_id", "is_active");
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "web_push_subscriptions" cascade;');
  }
}
