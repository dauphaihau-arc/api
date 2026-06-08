import { Migration } from '@mikro-orm/migrations';

export class Migration20260607090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "order_events" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "order_id" uuid not null,
        "type" varchar(255) not null,
        "occurred_at" timestamptz not null,
        "actor_type" varchar(255) not null,
        "actor_id" varchar(255) null,
        "source" varchar(255) null,
        "payload" jsonb null,
        constraint "order_events_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      create index "order_events_order_id_occurred_at_index"
      on "order_events" ("order_id", "occurred_at");
    `);

    this.addSql(`
      alter table "order_events"
      add constraint "order_events_order_id_foreign"
      foreign key ("order_id") references "orders" ("id")
      on update cascade on delete cascade;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      drop table if exists "order_events" cascade;
    `);
  }
}
