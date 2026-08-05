import { Migration } from '@mikro-orm/migrations';

export class Migration20260805120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "order_exports" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "shop_id" uuid not null,
        "requested_by_user_id" uuid not null,
        "status" text check ("status" in ('queued', 'processing', 'completed', 'failed', 'expired')) not null default 'queued',
        "filters_json" jsonb not null,
        "columns_json" jsonb not null,
        "timezone" varchar(100) not null,
        "filename" varchar(255) not null,
        "total_rows" int null,
        "processed_rows" int not null default 0,
        "file_storage_key" text null,
        "error_message" text null,
        "completed_at" timestamptz null,
        "expires_at" timestamptz not null,
        constraint "order_exports_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      alter table "order_exports"
        add constraint "order_exports_shop_id_foreign"
        foreign key ("shop_id") references "shops" ("id")
        on update cascade on delete cascade;
    `);

    this.addSql(`
      alter table "order_exports"
        add constraint "order_exports_requested_by_user_id_foreign"
        foreign key ("requested_by_user_id") references "users" ("id")
        on update cascade on delete cascade;
    `);

    this.addSql(`
      create index "order_exports_shop_requested_by_created_at_index"
        on "order_exports" ("shop_id", "requested_by_user_id", "created_at");
    `);

    this.addSql(`
      create index "order_exports_status_created_at_index"
        on "order_exports" ("status", "created_at");
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "order_exports" cascade;');
  }
}
