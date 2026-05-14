import { Migration } from '@mikro-orm/migrations';

export class Migration20260514000200 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table "carts" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "user_id" uuid not null, "is_temp" boolean not null default false, constraint "carts_pkey" primary key ("id"));`);
    this.addSql(`create index "carts_user_id_is_temp_index" on "carts" ("user_id", "is_temp");`);

    this.addSql(`create table "cart_items" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "cart_id" uuid not null, "shop_id" uuid not null, "product_id" uuid not null, "product_inventory_id" uuid not null, "quantity" int not null, "is_select_order" boolean not null default true, constraint "cart_items_pkey" primary key ("id"));`);
    this.addSql(`alter table "cart_items" add constraint "cart_items_cart_id_product_inventory_id_unique" unique ("cart_id", "product_inventory_id");`);
    this.addSql(`create index "cart_items_cart_id_index" on "cart_items" ("cart_id");`);
    this.addSql(`create index "cart_items_shop_id_index" on "cart_items" ("shop_id");`);
    this.addSql(`create index "cart_items_product_inventory_id_index" on "cart_items" ("product_inventory_id");`);

    this.addSql(`alter table "carts" add constraint "carts_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "cart_items" add constraint "cart_items_cart_id_foreign" foreign key ("cart_id") references "carts" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "cart_items" add constraint "cart_items_shop_id_foreign" foreign key ("shop_id") references "shops" ("id") on update cascade on delete restrict;`);
    this.addSql(`alter table "cart_items" add constraint "cart_items_product_id_foreign" foreign key ("product_id") references "products" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "cart_items" add constraint "cart_items_product_inventory_id_foreign" foreign key ("product_inventory_id") references "product_inventory" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "cart_items" cascade;`);
    this.addSql(`drop table if exists "carts" cascade;`);
  }
}
