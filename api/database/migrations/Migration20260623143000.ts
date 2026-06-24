import { Migration } from '@mikro-orm/migrations';

export class Migration20260623143000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "product_best_seller_rankings" (
        "id" uuid not null default gen_random_uuid(),
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "product_id" uuid not null,
        "window_days" int not null,
        "rank" int not null,
        "order_count" int not null,
        "latest_order_at" timestamptz not null,
        constraint "product_best_seller_rankings_pkey" primary key ("id")
      );
    `);
    this.addSql('create index "product_best_seller_rankings_window_rank_index" on "product_best_seller_rankings" ("window_days", "rank");');
    this.addSql('create unique index "product_best_seller_rankings_window_rank_unique" on "product_best_seller_rankings" ("window_days", "rank");');
    this.addSql('create unique index "product_best_seller_rankings_window_product_unique" on "product_best_seller_rankings" ("window_days", "product_id");');
    this.addSql(`
      alter table "product_best_seller_rankings"
      add constraint "product_best_seller_rankings_product_id_foreign"
      foreign key ("product_id")
      references "products" ("id")
      on update cascade
      on delete cascade;
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "product_best_seller_rankings" cascade;');
  }
}
