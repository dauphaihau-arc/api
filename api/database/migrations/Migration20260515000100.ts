import { Migration } from '@mikro-orm/migrations';

export class Migration20260515000100 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table "coupons" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "shop_id" uuid not null, "code" varchar(12) not null, "applies_to" varchar(20) not null, "applies_product_ids" text[] not null default '{}', "type" varchar(20) not null, "amount_off" numeric(12,2) not null default 0, "percent_off" int not null default 0, "start_date" timestamptz not null, "end_date" timestamptz not null, "max_uses" int not null, "max_uses_per_user" int not null, "uses_count" int not null default 0, "min_order_type" varchar(30) not null, "min_order_value" numeric(12,2) not null default 0, "min_products" int not null default 0, "is_active" boolean not null default true, "is_auto_sale" boolean not null default false, constraint "coupons_pkey" primary key ("id"));`);
    this.addSql(`create index "coupons_shop_id_index" on "coupons" ("shop_id");`);
    this.addSql(`create index "coupons_code_index" on "coupons" ("code");`);
    this.addSql(`alter table "coupons" add constraint "coupons_shop_id_code_unique" unique ("shop_id", "code");`);

    this.addSql(`create table "orders" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "user_id" uuid null, "customer_email" varchar(320) not null, "shop_id" uuid not null, "payment_type" varchar(20) not null, "status" varchar(30) not null, "shipping_status" varchar(30) not null, "currency" varchar(3) not null, "subtotal" numeric(12,2) not null, "total_shipping_fee" numeric(12,2) not null default 0, "total_discount" numeric(12,2) not null default 0, "total" numeric(12,2) not null, "note" text null, "promo_codes" text[] not null default '{}', "shipping_address" jsonb not null, "shipping_origin_countries" text[] not null default '{}', "shipping_to_country" varchar(2) not null, "shipping_estimated_delivery" timestamptz not null, "payment_details" jsonb null, constraint "orders_pkey" primary key ("id"));`);
    this.addSql(`create index "orders_user_id_index" on "orders" ("user_id");`);
    this.addSql(`create index "orders_shop_id_index" on "orders" ("shop_id");`);

    this.addSql(`create table "order_items" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "order_id" uuid not null, "product_id" uuid not null, "inventory_id" uuid not null, "title" text not null, "image_url" text null, "variant_group_name" varchar(100) null, "variant_sub_group_name" varchar(100) null, "variant_name" varchar(255) null, "price" numeric(12,2) not null, "sale_price" numeric(12,2) null, "quantity" int not null, "percent_coupon_code" varchar(12) null, "percent_coupon_percent" int null, constraint "order_items_pkey" primary key ("id"));`);
    this.addSql(`create index "order_items_order_id_index" on "order_items" ("order_id");`);

    this.addSql(`create table "coupon_usages" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "coupon_id" uuid not null, "user_id" uuid not null, "order_id" uuid not null, "code" varchar(12) not null, constraint "coupon_usages_pkey" primary key ("id"));`);
    this.addSql(`create index "coupon_usages_coupon_id_index" on "coupon_usages" ("coupon_id");`);
    this.addSql(`create index "coupon_usages_user_id_index" on "coupon_usages" ("user_id");`);
    this.addSql(`alter table "coupon_usages" add constraint "coupon_usages_coupon_id_order_id_unique" unique ("coupon_id", "order_id");`);

    this.addSql(`alter table "coupons" add constraint "coupons_shop_id_foreign" foreign key ("shop_id") references "shops" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "orders" add constraint "orders_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "orders" add constraint "orders_shop_id_foreign" foreign key ("shop_id") references "shops" ("id") on update cascade on delete restrict;`);
    this.addSql(`alter table "order_items" add constraint "order_items_order_id_foreign" foreign key ("order_id") references "orders" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "order_items" add constraint "order_items_product_id_foreign" foreign key ("product_id") references "products" ("id") on update cascade on delete restrict;`);
    this.addSql(`alter table "order_items" add constraint "order_items_inventory_id_foreign" foreign key ("inventory_id") references "product_inventory" ("id") on update cascade on delete restrict;`);
    this.addSql(`alter table "coupon_usages" add constraint "coupon_usages_coupon_id_foreign" foreign key ("coupon_id") references "coupons" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "coupon_usages" add constraint "coupon_usages_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "coupon_usages" drop constraint "coupon_usages_coupon_id_foreign";`);
    this.addSql(`alter table "coupon_usages" drop constraint "coupon_usages_user_id_foreign";`);
    this.addSql(`alter table "order_items" drop constraint "order_items_order_id_foreign";`);
    this.addSql(`alter table "order_items" drop constraint "order_items_product_id_foreign";`);
    this.addSql(`alter table "order_items" drop constraint "order_items_inventory_id_foreign";`);
    this.addSql(`alter table "orders" drop constraint "orders_user_id_foreign";`);
    this.addSql(`alter table "orders" drop constraint "orders_shop_id_foreign";`);
    this.addSql(`alter table "coupons" drop constraint "coupons_shop_id_foreign";`);
    this.addSql(`drop table if exists "coupon_usages" cascade;`);
    this.addSql(`drop table if exists "order_items" cascade;`);
    this.addSql(`drop table if exists "orders" cascade;`);
    this.addSql(`drop table if exists "coupons" cascade;`);
  }
}
