import { Migration } from '@mikro-orm/migrations';

export class Migration20261019160000_create_payouts extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "payouts" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "public_id" varchar(32) not null,
        "shop_id" uuid not null,
        "payout_account_id" uuid not null,
        "currency" varchar(3) not null,
        "amount_minor" int not null,
        "state" varchar(16) not null,
        "provider_reference" varchar(255) null,
        "attempt_count" int not null default 1,
        "run_day" date not null,
        "paid_at" timestamptz null,
        constraint "payouts_pkey" primary key ("id")
      );
    `);
    this.addSql(`
      alter table "payouts"
        add constraint "payouts_public_id_unique" unique ("public_id");
    `);
    // A shop is paid at most once per platform day: the run's claim into this
    // index is what keeps a second tick from paying the same day twice.
    this.addSql(`
      alter table "payouts"
        add constraint "payouts_shop_id_run_day_unique" unique ("shop_id", "run_day");
    `);
    this.addSql(`
      create index "payouts_shop_id_created_at_index"
        on "payouts" ("shop_id", "created_at");
    `);
    this.addSql(`
      alter table "payouts"
        add constraint "payouts_shop_id_foreign"
        foreign key ("shop_id") references "shops" ("id")
        on update cascade on delete restrict;
    `);
    // A Payout keeps pointing at the Payout Account it paid, even after that
    // account is replaced.
    this.addSql(`
      alter table "payouts"
        add constraint "payouts_payout_account_id_foreign"
        foreign key ("payout_account_id") references "payout_accounts" ("id")
        on update cascade on delete restrict;
    `);

    this.addSql(`
      create table "payout_lines" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "payout_id" uuid not null,
        "order_id" uuid not null,
        "amount_minor" int not null,
        constraint "payout_lines_pkey" primary key ("id")
      );
    `);
    // One Order's available payable is discharged by exactly one Payout.
    this.addSql(`
      alter table "payout_lines"
        add constraint "payout_lines_order_id_unique" unique ("order_id");
    `);
    this.addSql(`
      create index "payout_lines_payout_id_index"
        on "payout_lines" ("payout_id");
    `);
    this.addSql(`
      alter table "payout_lines"
        add constraint "payout_lines_payout_id_foreign"
        foreign key ("payout_id") references "payouts" ("id")
        on update cascade on delete restrict;
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "payout_lines" cascade;');
    this.addSql('drop table if exists "payouts" cascade;');
  }
}
