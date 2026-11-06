import { Migration } from '@mikro-orm/migrations';

/**
 * Expand slice: saved addresses gain canonical location codes while the
 * legacy name columns stay authoritative for checkout and order snapshots.
 * Legacy country/state remain NOT NULL until the later cutover slice.
 */
export class Migration20261106130000_add_user_address_location_codes extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "user_addresses"
        add column "country_code" varchar(2) null,
        add column "state_code" varchar(16) null,
        add column "country_text" varchar(255) null,
        add column "state_text" varchar(255) null;
    `);

    this.addSql(`
      alter table "user_addresses"
        add constraint "user_addresses_country_code_foreign"
        foreign key ("country_code") references "location_countries" ("code")
        on update cascade on delete restrict;
    `);

    // The composite foreign key needs a matching unique key on the area table.
    this.addSql(`
      create unique index "location_administrative_areas_country_code_code_unique"
        on "location_administrative_areas" ("country_code", "code");
    `);

    // A state code is only valid for the country stored on the same address.
    this.addSql(`
      alter table "user_addresses"
        add constraint "user_addresses_state_code_foreign"
        foreign key ("country_code", "state_code")
        references "location_administrative_areas" ("country_code", "code")
        on update cascade on delete restrict;
    `);

    // A location is either coded or free text, never both.
    this.addSql(`
      alter table "user_addresses"
        add constraint "user_addresses_country_code_or_text_check"
        check ("country_code" is null or "country_text" is null),
        add constraint "user_addresses_state_code_or_text_check"
        check ("state_code" is null or "state_text" is null),
        add constraint "user_addresses_state_code_requires_country_check"
        check ("state_code" is null or "country_code" is not null);
    `);

    this.addSql(`
      create index "user_addresses_country_code_index"
        on "user_addresses" ("country_code");
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop index if exists "user_addresses_country_code_index";');
    this.addSql(`
      alter table "user_addresses"
        drop constraint if exists "user_addresses_state_code_requires_country_check",
        drop constraint if exists "user_addresses_state_code_or_text_check",
        drop constraint if exists "user_addresses_country_code_or_text_check",
        drop constraint if exists "user_addresses_state_code_foreign",
        drop constraint if exists "user_addresses_country_code_foreign";
    `);
    this.addSql(
      'drop index if exists "location_administrative_areas_country_code_code_unique";',
    );
    this.addSql(`
      alter table "user_addresses"
        drop column if exists "state_text",
        drop column if exists "country_text",
        drop column if exists "state_code",
        drop column if exists "country_code";
    `);
  }
}
