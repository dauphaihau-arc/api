import { Migration } from '@mikro-orm/migrations';

export class Migration20260618110000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "products"
      add column "review_count" int not null default 0;
    `);
    this.addSql(`
      create table "product_reviews" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "product_id" uuid not null,
        "shop_id" uuid not null,
        "user_id" uuid not null,
        "order_id" uuid not null,
        "order_item_id" uuid not null,
        "rating" int not null,
        "title" varchar(120) null,
        "body" text null,
        "status" text check ("status" in ('published', 'hidden')) not null default 'published',
        constraint "product_reviews_pkey" primary key ("id")
      );
    `);
    this.addSql(`
      alter table "product_reviews"
      add constraint "product_reviews_product_id_foreign"
      foreign key ("product_id")
      references "products" ("id")
      on update cascade
      on delete cascade;
    `);
    this.addSql(`
      alter table "product_reviews"
      add constraint "product_reviews_shop_id_foreign"
      foreign key ("shop_id")
      references "shops" ("id")
      on update cascade
      on delete restrict;
    `);
    this.addSql(`
      alter table "product_reviews"
      add constraint "product_reviews_user_id_foreign"
      foreign key ("user_id")
      references "users" ("id")
      on update cascade
      on delete cascade;
    `);
    this.addSql(`
      alter table "product_reviews"
      add constraint "product_reviews_order_id_foreign"
      foreign key ("order_id")
      references "orders" ("id")
      on update cascade
      on delete cascade;
    `);
    this.addSql(`
      alter table "product_reviews"
      add constraint "product_reviews_order_item_id_foreign"
      foreign key ("order_item_id")
      references "order_items" ("id")
      on update cascade
      on delete cascade;
    `);
    this.addSql(`
      create index "product_reviews_product_id_status_created_at_index"
      on "product_reviews" ("product_id", "status", "created_at");
    `);
    this.addSql(`
      create index "product_reviews_user_id_created_at_index"
      on "product_reviews" ("user_id", "created_at");
    `);
    this.addSql(`
      create unique index "product_reviews_order_item_id_unique"
      on "product_reviews" ("order_item_id");
    `);
    this.addSql(`
      create table "product_review_images" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "review_id" uuid not null,
        "storage_key" varchar(500) not null,
        "rank" int not null,
        constraint "product_review_images_pkey" primary key ("id")
      );
    `);
    this.addSql(`
      alter table "product_review_images"
      add constraint "product_review_images_review_id_foreign"
      foreign key ("review_id")
      references "product_reviews" ("id")
      on update cascade
      on delete cascade;
    `);
    this.addSql(`
      create index "product_review_images_review_id_index"
      on "product_review_images" ("review_id");
    `);
    this.addSql(`
      create unique index "product_review_images_review_id_rank_unique"
      on "product_review_images" ("review_id", "rank");
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      drop table if exists "product_review_images" cascade;
    `);
    this.addSql(`
      drop table if exists "product_reviews" cascade;
    `);
    this.addSql(`
      alter table "products"
      drop column "review_count";
    `);
  }
}
