import { Migration } from '@mikro-orm/migrations';

export class Migration20261019150000_create_payout_accounts extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "payout_accounts" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "shop_id" uuid not null,
        "type" varchar(16) not null,
        "provider" varchar(32) not null,
        "provider_ref_encrypted" text not null,
        "holder_name" varchar(255) not null,
        "bank_name" varchar(255) not null,
        "country" varchar(2) not null,
        "currency" varchar(3) not null,
        "last4" varchar(4) not null,
        "status" varchar(16) not null,
        "verified_at" timestamptz null,
        "deactivated_at" timestamptz null,
        constraint "payout_accounts_pkey" primary key ("id")
      );
    `);
    // One active Payout Account per shop; closed rows are history and keep
    // serving the Payouts that already pointed at them.
    this.addSql(`
      create unique index "payout_accounts_shop_id_active_unique"
        on "payout_accounts" ("shop_id")
        where "deactivated_at" is null;
    `);
    this.addSql(`
      create index "payout_accounts_shop_id_deactivated_at_index"
        on "payout_accounts" ("shop_id", "deactivated_at");
    `);
    this.addSql(`
      alter table "payout_accounts"
        add constraint "payout_accounts_shop_id_foreign"
        foreign key ("shop_id") references "shops" ("id")
        on update cascade on delete restrict;
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "payout_accounts" cascade;');
  }
}
