import { Migration } from '@mikro-orm/migrations';

export class Migration20261017133028_create_finance_ledger extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "journal_entries" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "money_event_key" varchar(255) not null,
        "money_event_kind" varchar(64) not null,
        "shop_id" uuid not null,
        "currency" varchar(3) not null,
        "occurred_at" timestamptz not null,
        constraint "journal_entries_pkey" primary key ("id")
      );
    `);
    this.addSql(`
      alter table "journal_entries"
        add constraint "journal_entries_money_event_key_unique"
        unique ("money_event_key");
    `);

    this.addSql(`
      create table "ledger_accounts" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "account_key" varchar(160) not null,
        "kind" text check ("kind" in ('platform_clearing', 'seller_payable')) not null,
        "currency" varchar(3) not null,
        "shop_id" uuid null,
        constraint "ledger_accounts_pkey" primary key ("id")
      );
    `);
    this.addSql(`
      alter table "ledger_accounts"
        add constraint "ledger_accounts_account_key_unique"
        unique ("account_key");
    `);

    this.addSql(`
      create table "postings" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "journal_entry_id" uuid not null,
        "ledger_account_id" uuid not null,
        "amount_minor" int not null,
        constraint "postings_pkey" primary key ("id")
      );
    `);
    this.addSql(`
      create index "postings_ledger_account_id_index"
        on "postings" ("ledger_account_id");
    `);

    this.addSql(`
      create table "seller_payable_positions" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "shop_id" uuid not null,
        "currency" varchar(3) not null,
        "available_minor" int not null default 0,
        "not_yet_available_minor" int not null default 0,
        constraint "seller_payable_positions_pkey" primary key ("id")
      );
    `);
    this.addSql(`
      alter table "seller_payable_positions"
        add constraint "seller_payable_positions_shop_id_currency_unique"
        unique ("shop_id", "currency");
    `);

    this.addSql(`
      alter table "journal_entries"
        add constraint "journal_entries_shop_id_foreign"
        foreign key ("shop_id") references "shops" ("id")
        on update cascade on delete restrict;
    `);
    this.addSql(`
      alter table "ledger_accounts"
        add constraint "ledger_accounts_shop_id_foreign"
        foreign key ("shop_id") references "shops" ("id")
        on update cascade on delete restrict;
    `);
    this.addSql(`
      alter table "postings"
        add constraint "postings_journal_entry_id_foreign"
        foreign key ("journal_entry_id") references "journal_entries" ("id")
        on update cascade on delete restrict;
    `);
    this.addSql(`
      alter table "postings"
        add constraint "postings_ledger_account_id_foreign"
        foreign key ("ledger_account_id") references "ledger_accounts" ("id")
        on update cascade on delete restrict;
    `);
    this.addSql(`
      alter table "seller_payable_positions"
        add constraint "seller_payable_positions_shop_id_foreign"
        foreign key ("shop_id") references "shops" ("id")
        on update cascade on delete restrict;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "postings"
        drop constraint "postings_ledger_account_id_foreign";
    `);
    this.addSql(`
      alter table "postings"
        drop constraint "postings_journal_entry_id_foreign";
    `);
    this.addSql(`
      alter table "seller_payable_positions"
        drop constraint "seller_payable_positions_shop_id_foreign";
    `);
    this.addSql(`
      alter table "ledger_accounts"
        drop constraint "ledger_accounts_shop_id_foreign";
    `);
    this.addSql(`
      alter table "journal_entries"
        drop constraint "journal_entries_shop_id_foreign";
    `);

    this.addSql('drop table if exists "postings" cascade;');
    this.addSql('drop table if exists "seller_payable_positions" cascade;');
    this.addSql('drop table if exists "ledger_accounts" cascade;');
    this.addSql('drop table if exists "journal_entries" cascade;');
  }
}
