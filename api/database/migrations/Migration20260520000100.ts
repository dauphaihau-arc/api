import { Migration } from '@mikro-orm/migrations';

export class Migration20260520000100 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table "outbox_events" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "event_name" varchar(255) not null, "aggregate_type" varchar(255) not null, "aggregate_id" varchar(255) not null, "payload" jsonb not null, "status" text check ("status" in ('pending', 'processing', 'processed', 'failed')) not null default 'pending', "attempt_count" int not null default 0, "available_at" timestamptz not null, "processed_at" timestamptz null, "last_error" text null, constraint "outbox_events_pkey" primary key ("id"));`);
    this.addSql(`create index "outbox_events_status_available_at_index" on "outbox_events" ("status", "available_at");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "outbox_events" cascade;`);
  }
}
