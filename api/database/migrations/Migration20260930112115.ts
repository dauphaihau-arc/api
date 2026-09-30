import { Migration } from '@mikro-orm/migrations';

/**
 * The shared Promotion model behind Sales and Checkout Discounts.
 *
 * `promotions` holds the definition (shop ownership, ordinary internal name,
 * application kind, benefit, Promotion Currency, Product Scope, schedule
 * timezone, and retained stop state); `promotion_products` holds explicit
 * Product targets; `promotion_codes` holds each Checkout Discount's single
 * Promo Code; and `promotion_usages` records one committed redemption per
 * applied checkout Promotion and Order.
 *
 * The legacy `coupons` tables are untouched: the coupon path stays operational
 * while its consumers migrate, and this migration only adds the model that
 * Sales are built on.
 */
export class Migration20260930112115 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "promotions" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "shop_id" uuid not null,
        "name" varchar(255) not null,
        "application_kind" text check ("application_kind" in ('sale', 'checkout_discount')) not null,
        "benefit_type" text check ("benefit_type" in ('percentage', 'fixed_amount', 'free_shipping')) not null,
        "currency" varchar(3) not null,
        "percent_off" int null,
        "amount_off" numeric(12,2) null,
        "product_scope" text check ("product_scope" in ('all', 'specific')) not null default 'all',
        "visibility" text check ("visibility" in ('public', 'code_only')) null,
        "min_order_type" text check ("min_order_type" in ('none', 'purchase_quantity', 'order_total')) null,
        "min_order_value" numeric(12,2) not null default 0,
        "min_purchase_quantity" int not null default 0,
        "max_redemptions" int null,
        "max_redemptions_per_buyer" int null,
        "start_at" timestamptz not null,
        "end_at" timestamptz not null,
        "timezone" varchar(64) not null,
        "cancelled_at" timestamptz null,
        "ended_at" timestamptz null,
        constraint "promotions_pkey" primary key ("id")
      );
    `);
    this.addSql('create index "promotions_shop_id_application_kind_index" on "promotions" ("shop_id", "application_kind");');
    this.addSql('create index "promotions_shop_id_index" on "promotions" ("shop_id");');

    this.addSql(`
      create table "promotion_products" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "promotion_id" uuid not null,
        "product_id" uuid not null,
        constraint "promotion_products_pkey" primary key ("id")
      );
    `);
    this.addSql('create index "promotion_products_product_id_index" on "promotion_products" ("product_id");');
    this.addSql('create index "promotion_products_promotion_id_index" on "promotion_products" ("promotion_id");');
    this.addSql('alter table "promotion_products" add constraint "promotion_products_promotion_id_product_id_unique" unique ("promotion_id", "product_id");');

    this.addSql(`
      create table "promotion_codes" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "promotion_id" uuid not null,
        "shop_id" uuid not null,
        "code" varchar(32) not null,
        constraint "promotion_codes_pkey" primary key ("id")
      );
    `);
    this.addSql('alter table "promotion_codes" add constraint "promotion_codes_promotion_id_unique" unique ("promotion_id");');
    this.addSql('create index "promotion_codes_promotion_id_index" on "promotion_codes" ("promotion_id");');
    this.addSql('alter table "promotion_codes" add constraint "promotion_codes_shop_id_code_unique" unique ("shop_id", "code");');

    this.addSql(`
      create table "promotion_usages" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "promotion_id" uuid not null,
        "user_id" uuid null,
        "order_id" uuid not null,
        "code" varchar(32) not null,
        constraint "promotion_usages_pkey" primary key ("id")
      );
    `);
    this.addSql('create index "promotion_usages_user_id_index" on "promotion_usages" ("user_id");');
    this.addSql('create index "promotion_usages_promotion_id_index" on "promotion_usages" ("promotion_id");');
    this.addSql('alter table "promotion_usages" add constraint "promotion_usages_promotion_id_order_id_unique" unique ("promotion_id", "order_id");');

    this.addSql('alter table "promotions" add constraint "promotions_shop_id_foreign" foreign key ("shop_id") references "shops" ("id") on update cascade on delete cascade;');
    this.addSql('alter table "promotion_products" add constraint "promotion_products_promotion_id_foreign" foreign key ("promotion_id") references "promotions" ("id") on update cascade on delete cascade;');
    this.addSql('alter table "promotion_codes" add constraint "promotion_codes_promotion_id_foreign" foreign key ("promotion_id") references "promotions" ("id") on update cascade on delete cascade;');
    this.addSql('alter table "promotion_usages" add constraint "promotion_usages_promotion_id_foreign" foreign key ("promotion_id") references "promotions" ("id") on update cascade on delete cascade;');
  }

  override async down(): Promise<void> {
    this.addSql('alter table "promotion_usages" drop constraint "promotion_usages_promotion_id_foreign";');
    this.addSql('alter table "promotion_codes" drop constraint "promotion_codes_promotion_id_foreign";');
    this.addSql('alter table "promotion_products" drop constraint "promotion_products_promotion_id_foreign";');
    this.addSql('alter table "promotions" drop constraint "promotions_shop_id_foreign";');
    this.addSql('drop table if exists "promotion_usages" cascade;');
    this.addSql('drop table if exists "promotion_codes" cascade;');
    this.addSql('drop table if exists "promotion_products" cascade;');
    this.addSql('drop table if exists "promotions" cascade;');
  }
}
