import { Migration } from '@mikro-orm/migrations';

export class Migration20260527133000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "exchange_rates" (
        "id" uuid not null,
        "from_currency" varchar(3) not null,
        "to_currency" varchar(3) not null,
        "rate" numeric(20,10) not null,
        "effective_at" timestamptz not null,
        "expires_at" timestamptz null,
        "source" varchar(100) not null,
        "source_timestamp" timestamptz null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        constraint "exchange_rates_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      create index if not exists "exchange_rates_lookup_index"
      on "exchange_rates" ("from_currency", "to_currency", "effective_at");
    `);

    this.addSql(`
      create unique index if not exists "exchange_rates_pair_effective_unique"
      on "exchange_rates" ("from_currency", "to_currency", "effective_at");
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "exchange_rates" cascade;');
  }
}
