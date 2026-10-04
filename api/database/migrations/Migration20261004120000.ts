import { Migration } from '@mikro-orm/migrations';

/**
 * Ticket 10 contraction: the legacy Coupon model is gone.
 *
 * `coupons` and `coupon_usages` are dropped together with the legacy
 * `order_items` coupon columns. Checkout Discounts and Sales live on the shared
 * Promotion model (`promotions`, `promotion_products`, `promotion_codes`,
 * `promotion_usages`), which this migration leaves untouched. No conversion is
 * performed: existing development Coupon rows are disposable, and committed
 * Order facts no longer depend on the dropped columns.
 */
export class Migration20261004120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('alter table "order_items" drop column if exists "percent_coupon_code";');
    this.addSql('alter table "order_items" drop column if exists "percent_coupon_percent";');
    this.addSql('drop table if exists "coupon_usages" cascade;');
    this.addSql('drop table if exists "coupons" cascade;');
  }

  override async down(): Promise<void> {
    this.addSql(`
      create table "coupons" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "shop_id" uuid not null,
        "code" varchar(12) not null,
        "applies_to" varchar(20) not null,
        "applies_product_ids" text[] not null default '{}',
        "type" varchar(20) not null,
        "amount_off" numeric(12,2) not null default 0,
        "percent_off" int not null default 0,
        "start_date" timestamptz not null,
        "end_date" timestamptz not null,
        "max_uses" int not null,
        "max_uses_per_user" int not null,
        "uses_count" int not null default 0,
        "min_order_type" varchar(30) not null,
        "min_order_value" numeric(12,2) not null default 0,
        "min_products" int not null default 0,
        "is_active" boolean not null default true,
        "is_auto_sale" boolean not null default false,
        "visibility" varchar(20) not null default 'code_only',
        "currency" varchar(3) not null,
        constraint "coupons_pkey" primary key ("id")
      );
    `);
    this.addSql('create index "coupons_shop_id_index" on "coupons" ("shop_id");');
    this.addSql('create index "coupons_code_index" on "coupons" ("code");');
    this.addSql('alter table "coupons" add constraint "coupons_shop_id_code_unique" unique ("shop_id", "code");');
    this.addSql('alter table "coupons" add constraint "coupons_shop_id_foreign" foreign key ("shop_id") references "shops" ("id") on update cascade on delete cascade;');

    this.addSql(`
      create table "coupon_usages" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "coupon_id" uuid not null,
        "user_id" uuid not null,
        "order_id" uuid not null,
        "code" varchar(12) not null,
        constraint "coupon_usages_pkey" primary key ("id")
      );
    `);
    this.addSql('create index "coupon_usages_coupon_id_index" on "coupon_usages" ("coupon_id");');
    this.addSql('create index "coupon_usages_user_id_index" on "coupon_usages" ("user_id");');
    this.addSql('alter table "coupon_usages" add constraint "coupon_usages_coupon_id_order_id_unique" unique ("coupon_id", "order_id");');
    this.addSql('alter table "coupon_usages" add constraint "coupon_usages_coupon_id_foreign" foreign key ("coupon_id") references "coupons" ("id") on update cascade on delete cascade;');
    this.addSql('alter table "coupon_usages" add constraint "coupon_usages_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete cascade;');

    this.addSql('alter table "order_items" add column "percent_coupon_code" varchar(12) null;');
    this.addSql('alter table "order_items" add column "percent_coupon_percent" int null;');
  }
}
