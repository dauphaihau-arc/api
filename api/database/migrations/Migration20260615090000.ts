import { Migration } from '@mikro-orm/migrations';

export class Migration20260615090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('create table "product_view_history" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "product_id" uuid not null, "user_id" uuid null, "guest_session_id" varchar(255) null, "viewed_at" timestamptz not null, constraint "product_view_history_pkey" primary key ("id"));');
    this.addSql('alter table "product_view_history" add constraint "product_view_history_product_id_foreign" foreign key ("product_id") references "products" ("id") on update cascade on delete cascade;');
    this.addSql('alter table "product_view_history" add constraint "product_view_history_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;');
    this.addSql('create index "product_view_history_product_id_viewed_at_index" on "product_view_history" ("product_id", "viewed_at");');
    this.addSql('create index "product_view_history_user_id_viewed_at_index" on "product_view_history" ("user_id", "viewed_at");');
    this.addSql('create index "product_view_history_guest_session_id_viewed_at_index" on "product_view_history" ("guest_session_id", "viewed_at");');
    this.addSql('create unique index "product_view_history_user_id_product_id_unique" on "product_view_history" ("user_id", "product_id");');
    this.addSql('create unique index "product_view_history_guest_session_id_product_id_unique" on "product_view_history" ("guest_session_id", "product_id");');
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "product_view_history" cascade;');
  }
}
