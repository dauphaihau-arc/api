import { Migration } from '@mikro-orm/migrations';

/**
 * Arc-owned Location reference data. Countries and their level-1
 * administrative areas are seeded from committed JSON, never fetched from an
 * external provider at runtime. Dataset versions record what the seed
 * imported; only the row marked current is served by the public endpoints.
 */
export class Migration20261105120000_add_location_reference_data extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "location_countries" (
        "code" varchar(2) not null,
        "name" varchar(255) not null,
        "postal_code_required" boolean not null default false,
        "is_active" boolean not null default true,
        "created_at" timestamptz(6) not null,
        "updated_at" timestamptz(6) not null,
        constraint "location_countries_pkey" primary key ("code")
      );
    `);

    this.addSql(`
      create table "location_administrative_areas" (
        "code" varchar(16) not null,
        "country_code" varchar(2) not null,
        "name" varchar(255) not null,
        "type" varchar(64) null,
        "is_active" boolean not null default true,
        "created_at" timestamptz(6) not null,
        "updated_at" timestamptz(6) not null,
        constraint "location_administrative_areas_pkey" primary key ("code")
      );
    `);

    this.addSql(`
      alter table "location_administrative_areas"
        add constraint "location_administrative_areas_country_code_foreign"
        foreign key ("country_code") references "location_countries" ("code")
        on update cascade on delete restrict;
    `);

    this.addSql(`
      create index "location_administrative_areas_country_code_is_active_index"
        on "location_administrative_areas" ("country_code", "is_active");
    `);

    this.addSql(`
      create table "location_dataset_versions" (
        "id" uuid not null,
        "version" varchar(128) not null,
        "source" varchar(255) not null,
        "checksum" varchar(64) not null,
        "imported_at" timestamptz(6) not null,
        "is_current" boolean not null default false,
        "created_at" timestamptz(6) not null,
        "updated_at" timestamptz(6) not null,
        constraint "location_dataset_versions_pkey" primary key ("id")
      );
    `);

    // At most one dataset version can be current, so readers never race
    // between two "current" snapshots.
    this.addSql(`
      create unique index "location_dataset_versions_is_current_unique"
        on "location_dataset_versions" ("is_current")
        where "is_current" = true;
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "location_dataset_versions" cascade;');
    this.addSql('drop table if exists "location_administrative_areas" cascade;');
    this.addSql('drop table if exists "location_countries" cascade;');
  }
}
