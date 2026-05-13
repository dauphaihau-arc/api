import { Migration } from '@mikro-orm/migrations';

export class Migration20260512170125 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "categories" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "parent_id" uuid null, "name" varchar(255) not null, "rank" int not null, "image_storage_key" varchar(500) null, constraint "categories_pkey" primary key ("id"));`);

    this.addSql(`create table "category_attributes" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "category_id" uuid not null, "name" varchar(255) not null, "input_type" varchar(30) not null default 'select', "is_required" boolean not null default false, "rank" int not null default 1, constraint "category_attributes_pkey" primary key ("id"));`);
    this.addSql(`create index "category_attributes_category_id_index" on "category_attributes" ("category_id");`);
    this.addSql(`alter table "category_attributes" add constraint "category_attributes_category_id_name_unique" unique ("category_id", "name");`);

    this.addSql(`create table "category_attribute_options" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "category_attribute_id" uuid not null, "value" varchar(255) not null, "rank" int not null default 1, constraint "category_attribute_options_pkey" primary key ("id"));`);
    this.addSql(`create index "category_attribute_options_category_attribute_id_index" on "category_attribute_options" ("category_attribute_id");`);
    this.addSql(`alter table "category_attribute_options" add constraint "category_attribute_options_category_attribute_id_va_2e05d_unique" unique ("category_attribute_id", "value");`);

    this.addSql(`create table "shops" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "owner_user_id" uuid not null, "shop_name" varchar(20) not null, "status" varchar(20) not null default 'active', constraint "shops_pkey" primary key ("id"));`);
    this.addSql(`create index "shops_owner_user_id_index" on "shops" ("owner_user_id");`);
    this.addSql(`alter table "shops" add constraint "shops_shop_name_unique" unique ("shop_name");`);

    this.addSql(`create table "products" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "shop_id" uuid not null, "category_id" uuid null, "title" varchar(255) not null, "slug" varchar(255) not null, "description" text not null, "state" text check ("state" in ('active', 'draft', 'inactive', 'removed', 'unavailable')) not null default 'draft', "who_made" text check ("who_made" in ('i_did', 'collective', 'someone_else')) not null, "is_digital" boolean not null default false, "non_taxable" boolean not null default false, "variant_type" text check ("variant_type" in ('none', 'single', 'combine')) null, "variant_group_name" varchar(255) null, "variant_sub_group_name" varchar(255) null, "views" int not null default 0, "rating_average" numeric(3,1) not null default 0, "published_at" timestamptz null, constraint "products_pkey" primary key ("id"));`);
    this.addSql(`create index "products_category_id_index" on "products" ("category_id");`);
    this.addSql(`create index "products_state_index" on "products" ("state");`);
    this.addSql(`create index "products_shop_id_state_index" on "products" ("shop_id", "state");`);
    this.addSql(`alter table "products" add constraint "products_shop_id_slug_unique" unique ("shop_id", "slug");`);

    this.addSql(`create table "product_variants" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "product_id" uuid not null, "name" varchar(255) not null, "option_value_1" varchar(255) null, "option_value_2" varchar(255) null, "image_storage_key" varchar(500) null, "rank" int not null default 1, constraint "product_variants_pkey" primary key ("id"));`);
    this.addSql(`create index "product_variants_product_id_index" on "product_variants" ("product_id");`);
    this.addSql(`alter table "product_variants" add constraint "product_variants_product_id_name_unique" unique ("product_id", "name");`);

    this.addSql(`create table "product_shipping_profiles" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "product_id" uuid not null, "shop_id" uuid not null, "origin_country" varchar(2) not null, "origin_zip" varchar(50) not null, "process_time_label" varchar(100) not null, constraint "product_shipping_profiles_pkey" primary key ("id"));`);
    this.addSql(`create index "product_shipping_profiles_shop_id_index" on "product_shipping_profiles" ("shop_id");`);
    this.addSql(`alter table "product_shipping_profiles" add constraint "product_shipping_profiles_product_id_unique" unique ("product_id");`);

    this.addSql(`create table "product_shipping_destinations" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "product_shipping_profile_id" uuid not null, "country_code" varchar(2) not null, "delivery_time_label" varchar(100) not null, "service" varchar(100) not null, "charge_type" text check ("charge_type" in ('fixed_price', 'free_shipping')) not null default 'free_shipping', "rank" int not null default 1, constraint "product_shipping_destinations_pkey" primary key ("id"));`);
    this.addSql(`create index "product_shipping_destinations_product_shipping_profile_id_index" on "product_shipping_destinations" ("product_shipping_profile_id");`);
    this.addSql(`create index "product_shipping_destinations_country_code_index" on "product_shipping_destinations" ("country_code");`);

    this.addSql(`create table "product_inventory" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "shop_id" uuid not null, "product_id" uuid not null, "product_variant_id" uuid null, "sku" varchar(255) null, "stock" int not null, "price" numeric(12,2) not null, "sale_price" numeric(12,2) null, constraint "product_inventory_pkey" primary key ("id"));`);
    this.addSql(`create index "product_inventory_product_id_index" on "product_inventory" ("product_id");`);
    this.addSql(`create index "product_inventory_product_variant_id_index" on "product_inventory" ("product_variant_id");`);
    this.addSql(`alter table "product_inventory" add constraint "product_inventory_shop_id_sku_unique" unique ("shop_id", "sku");`);

    this.addSql(`create table "product_inventory_reservations" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "product_inventory_id" uuid not null, "order_id" uuid not null, "quantity" int not null, "reserved_at" timestamptz not null, "released_at" timestamptz null, constraint "product_inventory_reservations_pkey" primary key ("id"));`);
    this.addSql(`create index "product_inventory_reservations_product_inventory_id_index" on "product_inventory_reservations" ("product_inventory_id");`);
    this.addSql(`create index "product_inventory_reservations_order_id_index" on "product_inventory_reservations" ("order_id");`);
    this.addSql(`create index "product_inventory_reservations_released_at_index" on "product_inventory_reservations" ("released_at");`);

    this.addSql(`create table "product_images" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "product_id" uuid not null, "storage_key" varchar(500) not null, "rank" int not null, constraint "product_images_pkey" primary key ("id"));`);
    this.addSql(`create index "product_images_product_id_index" on "product_images" ("product_id");`);
    this.addSql(`alter table "product_images" add constraint "product_images_product_id_rank_unique" unique ("product_id", "rank");`);

    this.addSql(`create table "product_attribute_values" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "product_id" uuid not null, "category_attribute_id" uuid not null, "selected_option_id" uuid null, "selected_text" varchar(255) null, constraint "product_attribute_values_pkey" primary key ("id"));`);
    this.addSql(`create index "product_attribute_values_product_id_index" on "product_attribute_values" ("product_id");`);
    this.addSql(`alter table "product_attribute_values" add constraint "product_attribute_values_product_id_category_attri_50d48_unique" unique ("product_id", "category_attribute_id");`);

    this.addSql(`alter table "categories" add constraint "categories_parent_id_foreign" foreign key ("parent_id") references "categories" ("id") on update cascade on delete set null;`);
    this.addSql(`create index "categories_parent_id_index" on "categories" ("parent_id");`);
    this.addSql(`create index "categories_parent_id_rank_index" on "categories" ("parent_id", "rank");`);

    this.addSql(`alter table "category_attributes" add constraint "category_attributes_category_id_foreign" foreign key ("category_id") references "categories" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "category_attribute_options" add constraint "category_attribute_options_category_attribute_id_foreign" foreign key ("category_attribute_id") references "category_attributes" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "shops" add constraint "shops_owner_user_id_foreign" foreign key ("owner_user_id") references "users" ("id") on update cascade on delete restrict;`);

    this.addSql(`alter table "products" add constraint "products_shop_id_foreign" foreign key ("shop_id") references "shops" ("id") on update cascade on delete restrict;`);
    this.addSql(`alter table "products" add constraint "products_category_id_foreign" foreign key ("category_id") references "categories" ("id") on update cascade on delete set null;`);

    this.addSql(`alter table "product_variants" add constraint "product_variants_product_id_foreign" foreign key ("product_id") references "products" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "product_shipping_profiles" add constraint "product_shipping_profiles_product_id_foreign" foreign key ("product_id") references "products" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "product_shipping_profiles" add constraint "product_shipping_profiles_shop_id_foreign" foreign key ("shop_id") references "shops" ("id") on update cascade on delete restrict;`);

    this.addSql(`alter table "product_shipping_destinations" add constraint "product_shipping_destinations_product_shipping_p_38a8e_foreign" foreign key ("product_shipping_profile_id") references "product_shipping_profiles" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "product_inventory" add constraint "product_inventory_shop_id_foreign" foreign key ("shop_id") references "shops" ("id") on update cascade on delete restrict;`);
    this.addSql(`alter table "product_inventory" add constraint "product_inventory_product_id_foreign" foreign key ("product_id") references "products" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "product_inventory" add constraint "product_inventory_product_variant_id_foreign" foreign key ("product_variant_id") references "product_variants" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "product_inventory_reservations" add constraint "product_inventory_reservations_product_inventory_id_foreign" foreign key ("product_inventory_id") references "product_inventory" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "product_images" add constraint "product_images_product_id_foreign" foreign key ("product_id") references "products" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "product_attribute_values" add constraint "product_attribute_values_product_id_foreign" foreign key ("product_id") references "products" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "product_attribute_values" add constraint "product_attribute_values_category_attribute_id_foreign" foreign key ("category_attribute_id") references "category_attributes" ("id") on update cascade on delete restrict;`);
    this.addSql(`alter table "product_attribute_values" add constraint "product_attribute_values_selected_option_id_foreign" foreign key ("selected_option_id") references "category_attribute_options" ("id") on update cascade on delete restrict;`);

  }

  override async down(): Promise<void> {
    this.addSql(`alter table "categories" drop constraint "categories_parent_id_foreign";`);

    this.addSql(`alter table "category_attributes" drop constraint "category_attributes_category_id_foreign";`);

    this.addSql(`alter table "products" drop constraint "products_category_id_foreign";`);

    this.addSql(`alter table "category_attribute_options" drop constraint "category_attribute_options_category_attribute_id_foreign";`);

    this.addSql(`alter table "product_attribute_values" drop constraint "product_attribute_values_category_attribute_id_foreign";`);

    this.addSql(`alter table "product_attribute_values" drop constraint "product_attribute_values_selected_option_id_foreign";`);

    this.addSql(`alter table "products" drop constraint "products_shop_id_foreign";`);

    this.addSql(`alter table "product_shipping_profiles" drop constraint "product_shipping_profiles_shop_id_foreign";`);

    this.addSql(`alter table "product_inventory" drop constraint "product_inventory_shop_id_foreign";`);

    this.addSql(`alter table "product_variants" drop constraint "product_variants_product_id_foreign";`);

    this.addSql(`alter table "product_shipping_profiles" drop constraint "product_shipping_profiles_product_id_foreign";`);

    this.addSql(`alter table "product_inventory" drop constraint "product_inventory_product_id_foreign";`);

    this.addSql(`alter table "product_images" drop constraint "product_images_product_id_foreign";`);

    this.addSql(`alter table "product_attribute_values" drop constraint "product_attribute_values_product_id_foreign";`);

    this.addSql(`alter table "product_inventory" drop constraint "product_inventory_product_variant_id_foreign";`);

    this.addSql(`alter table "product_shipping_destinations" drop constraint "product_shipping_destinations_product_shipping_p_38a8e_foreign";`);

    this.addSql(`alter table "product_inventory_reservations" drop constraint "product_inventory_reservations_product_inventory_id_foreign";`);

    this.addSql(`drop table if exists "categories" cascade;`);

    this.addSql(`drop table if exists "category_attributes" cascade;`);

    this.addSql(`drop table if exists "category_attribute_options" cascade;`);

    this.addSql(`drop table if exists "shops" cascade;`);

    this.addSql(`drop table if exists "products" cascade;`);

    this.addSql(`drop table if exists "product_variants" cascade;`);

    this.addSql(`drop table if exists "product_shipping_profiles" cascade;`);

    this.addSql(`drop table if exists "product_shipping_destinations" cascade;`);

    this.addSql(`drop table if exists "product_inventory" cascade;`);

    this.addSql(`drop table if exists "product_inventory_reservations" cascade;`);

    this.addSql(`drop table if exists "product_images" cascade;`);

    this.addSql(`drop table if exists "product_attribute_values" cascade;`);

  }

}
