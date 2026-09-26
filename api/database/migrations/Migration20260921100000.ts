import { Migration } from '@mikro-orm/migrations';

/**
 * Introduces the shop-owned reusable Shipping Profile and retires the
 * per-Product shipping configuration.
 *
 * `shipping_profiles` owns stable identity, a seller-visible unique name, the
 * active/draft/archived lifecycle, an optimistic version, optional ship-from
 * dispatch context, the validated Processing range, and at most one default
 * designation per shop (`is_default`, guarded by a partial unique index).
 * `shipping_profile_rates` holds the ordered destination rates with minor-unit
 * one-item and additional-item fees denominated in the owning Shop.currency and
 * the validated Delivery range: a profile never carries its own currency and
 * stored amounts are never reinterpreted after a currency change. A rate covers
 * one configured country or every remaining destination — there is no Region
 * scope, so no row can carry a scope the code cannot hydrate.
 * `products.shipping_profile_id` is the single Product assignment; variants
 * inherit it and nothing copies rates.
 *
 * Both day ranges are nullable on purpose. The removed free-text
 * Processing/Delivery labels are not parsed and no numeric duration is
 * fabricated: every profile that predates this scope keeps null ranges, which
 * readiness reports as `missing_processing_time`/`missing_delivery_time` so the
 * seller completes them deliberately. Confirmed Order facts, including their
 * stored `shipping_estimated_delivery`, are left untouched.
 *
 * Legacy configuration is migrated without inventing terms: each distinct
 * legacy configuration (ship-from country/postal plus normalized destination
 * coverage and charge types) becomes one generated draft profile carrying the
 * recorded ship-from data and the recorded destination coverage. Generated
 * profiles stay `draft`, so they are never quoted and never imply free
 * shipping until a seller reviews the fees and activates them.
 */
export class Migration20260921100000 extends Migration {
  override async up(): Promise<void> {
    // A Processing range is either absent or a non-negative integer range with
    // minimum no greater than maximum. The populated branch requires both bounds
    // to be present: a CHECK whose expression evaluates to UNKNOWN passes, so a
    // partial NULL pair is excluded explicitly. The same rule guards the rate's
    // Delivery range below.
    this.addSql(`
      create table "shipping_profiles" (
        "id" uuid not null,
        "created_at" timestamptz(6) not null,
        "updated_at" timestamptz(6) not null,
        "shop_id" uuid not null,
        "name" varchar(80) not null,
        "normalized_name" varchar(80) not null,
        "status" varchar(30) not null default 'draft',
        "version" int not null default 1,
        "ship_from_country" varchar(2) null,
        "ship_from_postal" varchar(20) null,
        "processing_time_min_days" int null,
        "processing_time_max_days" int null,
        "is_default" boolean not null default false,
        constraint "shipping_profiles_pkey" primary key ("id"),
        constraint "shipping_profiles_processing_time_range_check"
        check (
          (
            "processing_time_min_days" is null
            and "processing_time_max_days" is null
          )
          or (
            "processing_time_min_days" is not null
            and "processing_time_max_days" is not null
            and "processing_time_min_days" >= 0
            and "processing_time_max_days" >= 0
            and "processing_time_min_days" <= "processing_time_max_days"
          )
        )
      );
    `);

    this.addSql(`
      create table "shipping_profile_rates" (
        "id" uuid not null,
        "created_at" timestamptz(6) not null,
        "updated_at" timestamptz(6) not null,
        "shipping_profile_id" uuid not null,
        "position" int not null,
        "destination_scope" varchar(30) not null,
        "destination_country" varchar(2) null,
        "one_item_fee_minor" int not null,
        "additional_item_fee_minor" int not null,
        "delivery_time_min_days" int null,
        "delivery_time_max_days" int null,
        constraint "shipping_profile_rates_pkey" primary key ("id"),
        constraint "shipping_profile_rates_delivery_time_range_check"
        check (
          (
            "delivery_time_min_days" is null
            and "delivery_time_max_days" is null
          )
          or (
            "delivery_time_min_days" is not null
            and "delivery_time_max_days" is not null
            and "delivery_time_min_days" >= 0
            and "delivery_time_max_days" >= 0
            and "delivery_time_min_days" <= "delivery_time_max_days"
          )
        )
      );
    `);

    this.addSql('alter table "shipping_profiles" add constraint "shipping_profiles_shop_id_foreign" foreign key ("shop_id") references "shops" ("id") on update cascade on delete restrict;');
    this.addSql('create index "shipping_profiles_shop_id_index" on "shipping_profiles" ("shop_id");');
    this.addSql('alter table "shipping_profiles" add constraint "shipping_profiles_shop_id_normalized_name_unique" unique ("shop_id", "normalized_name");');
    this.addSql('alter table "shipping_profile_rates" add constraint "shipping_profile_rates_shipping_profile_id_foreign" foreign key ("shipping_profile_id") references "shipping_profiles" ("id") on update cascade on delete cascade;');
    this.addSql('create index "shipping_profile_rates_shipping_profile_id_index" on "shipping_profile_rates" ("shipping_profile_id");');
    this.addSql('create index "shipping_profile_rates_shipping_profile_id_destination_scope_index" on "shipping_profile_rates" ("shipping_profile_id", "destination_scope");');

    // At most one default profile per shop. The partial index makes it a
    // database invariant, backing the guard the repository applies inside the
    // designation transaction.
    this.addSql(`
      create unique index "shipping_profiles_default_per_shop_unique"
        on "shipping_profiles" ("shop_id")
        where "is_default";
    `);

    this.addSql('alter table "products" add column "shipping_profile_id" uuid null;');
    this.addSql('alter table "products" add constraint "products_shipping_profile_id_foreign" foreign key ("shipping_profile_id") references "shipping_profiles" ("id") on update cascade on delete restrict;');
    this.addSql('create index "products_shipping_profile_id_index" on "products" ("shipping_profile_id");');

    this.addSql('drop table if exists "legacy_shipping_configuration";');
    this.addSql('drop table if exists "legacy_shipping_profile_map";');

    // One generated draft profile per distinct legacy configuration. Identical
    // ship-from data, destination coverage, and recorded charge types are
    // proven identical and share one profile; anything unequal stays separate.
    this.addSql(`
      create temporary table "legacy_shipping_configuration" on commit drop as
      select
        shipping_profile."id" as "legacy_profile_id",
        shipping_profile."product_id",
        shipping_profile."shop_id",
        shipping_profile."origin_country",
        shipping_profile."origin_zip",
        coalesce(
          string_agg(
            destination."country_code" || ':' || destination."charge_type",
            ',' order by destination."country_code", destination."charge_type"
          ),
          ''
        ) as "coverage_key"
      from "product_shipping_profiles" shipping_profile
      left join "product_shipping_destinations" destination
        on destination."product_shipping_profile_id" = shipping_profile."id"
      group by
        shipping_profile."id",
        shipping_profile."product_id",
        shipping_profile."shop_id",
        shipping_profile."origin_country",
        shipping_profile."origin_zip";
    `);

    this.addSql(`
      create temporary table "legacy_shipping_profile_map" on commit drop as
      select
        configuration."shop_id",
        configuration."origin_country",
        configuration."origin_zip",
        configuration."coverage_key",
        gen_random_uuid() as "shipping_profile_id",
        row_number() over (
          partition by configuration."shop_id"
          order by
            configuration."origin_country",
            configuration."origin_zip",
            configuration."coverage_key"
        ) as "profile_rank"
      from (
        select distinct
          "shop_id",
          "origin_country",
          "origin_zip",
          "coverage_key"
        from "legacy_shipping_configuration"
      ) configuration;
    `);

    this.addSql(`
      insert into "shipping_profiles" (
        "id",
        "created_at",
        "updated_at",
        "shop_id",
        "name",
        "normalized_name",
        "status",
        "version",
        "ship_from_country",
        "ship_from_postal"
      )
      select
        legacy."shipping_profile_id",
        now(),
        now(),
        legacy."shop_id",
        'Legacy shipping profile ' || legacy."profile_rank",
        'legacy shipping profile ' || legacy."profile_rank",
        'draft',
        1,
        legacy."origin_country",
        legacy."origin_zip"
      from "legacy_shipping_profile_map" legacy;
    `);

    // Generated destination coverage from the recorded legacy destination
    // countries. Fees stay zero and the profile stays draft: a draft profile is
    // never quoted, so this records coverage without promising a price the
    // legacy configuration never contained.
    this.addSql(`
      insert into "shipping_profile_rates" (
        "id",
        "created_at",
        "updated_at",
        "shipping_profile_id",
        "position",
        "destination_scope",
        "destination_country",
        "one_item_fee_minor",
        "additional_item_fee_minor"
      )
      select
        gen_random_uuid(),
        now(),
        now(),
        coverage."shipping_profile_id",
        row_number() over (
          partition by coverage."shipping_profile_id"
          order by coverage."country_code"
        ),
        'country',
        coverage."country_code",
        0,
        0
      from (
        select distinct
          legacy."shipping_profile_id",
          destination."country_code"
        from "legacy_shipping_configuration" configuration
        join "legacy_shipping_profile_map" legacy
          on legacy."shop_id" = configuration."shop_id"
          and legacy."origin_country" is not distinct from configuration."origin_country"
          and legacy."origin_zip" is not distinct from configuration."origin_zip"
          and legacy."coverage_key" = configuration."coverage_key"
        join "product_shipping_destinations" destination
          on destination."product_shipping_profile_id" = configuration."legacy_profile_id"
      ) coverage;
    `);

    // Each Product keeps exactly one assignment: the generated profile that
    // represents its own legacy configuration.
    this.addSql(`
      update "products" product
      set "shipping_profile_id" = legacy."shipping_profile_id"
      from "legacy_shipping_configuration" configuration
      join "legacy_shipping_profile_map" legacy
        on legacy."shop_id" = configuration."shop_id"
        and legacy."origin_country" is not distinct from configuration."origin_country"
        and legacy."origin_zip" is not distinct from configuration."origin_zip"
        and legacy."coverage_key" = configuration."coverage_key"
      where product."id" = configuration."product_id";
    `);

    this.addSql('drop table "product_shipping_destinations" cascade;');
    this.addSql('drop table "product_shipping_profiles" cascade;');
  }

  override async down(): Promise<void> {
    throw new Error('Migration20260921100000 is forward-only: reusable Shipping Profiles and the migrated Product assignment must be preserved.');
  }
}
