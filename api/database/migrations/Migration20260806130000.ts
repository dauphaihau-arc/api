import { Migration } from '@mikro-orm/migrations';

export class Migration20260806130000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "product_imports" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "shop_id" uuid not null,
        "requested_by_user_id" uuid not null,
        "status" text check ("status" in ('queued', 'processing', 'completed', 'failed')) not null default 'queued',
        "template_version" varchar(50) not null,
        "filename" varchar(255) not null,
        "source_file_storage_key" text not null,
        "report_file_storage_key" text null,
        "total_rows" int not null,
        "processed_rows" int not null default 0,
        "created_rows" int not null default 0,
        "failed_rows" int not null default 0,
        "error_message" text null,
        "completed_at" timestamptz null,
        "source_expires_at" timestamptz not null,
        "report_expires_at" timestamptz not null,
        constraint "product_imports_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      create table "product_import_rows" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "product_import_id" uuid not null,
        "row_number" int not null,
        "status" text check ("status" in ('pending', 'created', 'failed')) not null default 'pending',
        "row_json" jsonb not null,
        "product_id" uuid null,
        "sku" varchar(255) null,
        "title" varchar(255) null,
        "error_code" varchar(100) null,
        "error_message" text null,
        constraint "product_import_rows_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      alter table "product_imports"
        add constraint "product_imports_shop_id_foreign"
        foreign key ("shop_id") references "shops" ("id")
        on update cascade on delete cascade;
    `);

    this.addSql(`
      alter table "product_imports"
        add constraint "product_imports_requested_by_user_id_foreign"
        foreign key ("requested_by_user_id") references "users" ("id")
        on update cascade on delete cascade;
    `);

    this.addSql(`
      alter table "product_import_rows"
        add constraint "product_import_rows_product_import_id_foreign"
        foreign key ("product_import_id") references "product_imports" ("id")
        on update cascade on delete cascade;
    `);

    this.addSql(`
      alter table "product_import_rows"
        add constraint "product_import_rows_product_id_foreign"
        foreign key ("product_id") references "products" ("id")
        on delete set null;
    `);

    this.addSql(`
      create index "product_imports_shop_requested_by_created_at_index"
        on "product_imports" ("shop_id", "requested_by_user_id", "created_at");
    `);

    this.addSql(`
      create index "product_imports_status_created_at_index"
        on "product_imports" ("status", "created_at");
    `);

    this.addSql(`
      create index "product_import_rows_product_import_status_index"
        on "product_import_rows" ("product_import_id", "status");
    `);

    this.addSql(`
      alter table "product_import_rows"
        add constraint "product_import_rows_product_import_id_row_number_unique"
        unique ("product_import_id", "row_number");
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "product_import_rows" cascade;');
    this.addSql('drop table if exists "product_imports" cascade;');
  }
}
