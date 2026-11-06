import { Migration } from '@mikro-orm/migrations';

/**
 * Contract slice: saved addresses keep only canonical codes and preserved
 * legacy text. Readable country and subdivision names are derived on read, so
 * the duplicate display-name columns are no longer part of the schema.
 */
export class Migration20261106150000_drop_user_address_legacy_location_names extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "user_addresses"
        drop column if exists "state",
        drop column if exists "country";
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "user_addresses"
        add column "country" varchar(255) null,
        add column "state" varchar(255) null;
    `);

    // Rebuild the display names from the canonical codes so the restored
    // NOT NULL columns hold the same readable values the API used to return.
    this.addSql(`
      update "user_addresses"
      set
        "country" = coalesce(
          "country_text",
          (select "name" from "location_countries" where "code" = "user_addresses"."country_code"),
          "country_code",
          ''
        ),
        "state" = coalesce(
          "state_text",
          (
            select "name"
            from "location_administrative_areas"
            where "country_code" = "user_addresses"."country_code"
              and "code" = "user_addresses"."state_code"
          ),
          "state_code",
          ''
        );
    `);

    this.addSql(`
      alter table "user_addresses"
        alter column "country" set not null,
        alter column "state" set not null;
    `);
  }
}
