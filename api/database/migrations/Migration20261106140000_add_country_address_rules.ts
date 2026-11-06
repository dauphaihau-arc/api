import { Migration } from '@mikro-orm/migrations';

/**
 * Arc-owned address-format overrides. Rows hold only the deltas applied on
 * top of `lib-address/lite` metadata; merged rules are generated at read time.
 */
export class Migration20261106140000_add_country_address_rules extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "country_address_rules" (
        "country_code" varchar(2) not null,
        "rules" jsonb not null,
        "created_at" timestamptz(6) not null,
        "updated_at" timestamptz(6) not null,
        constraint "country_address_rules_pkey" primary key ("country_code")
      );
    `);

    this.addSql(`
      alter table "country_address_rules"
        add constraint "country_address_rules_country_code_foreign"
        foreign key ("country_code") references "location_countries" ("code")
        on update cascade on delete restrict;
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "country_address_rules" cascade;');
  }
}
