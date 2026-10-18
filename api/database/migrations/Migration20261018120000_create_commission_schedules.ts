import { Migration } from '@mikro-orm/migrations';

export class Migration20261018120000_create_commission_schedules extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "ledger_accounts"
        drop constraint if exists "ledger_accounts_kind_check";
    `);
    this.addSql(`
      alter table "ledger_accounts"
        add constraint "ledger_accounts_kind_check"
        check ("kind" in ('platform_clearing', 'platform_commission', 'seller_payable'));
    `);

    this.addSql(`
      create table "commission_schedules" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "shop_id" uuid not null,
        "effective_from" timestamptz not null,
        "rate_basis_points" int not null,
        constraint "commission_schedules_pkey" primary key ("id")
      );
    `);
    this.addSql(`
      alter table "commission_schedules"
        add constraint "commission_schedules_shop_id_effective_from_unique"
        unique ("shop_id", "effective_from");
    `);
    this.addSql(`
      alter table "commission_schedules"
        add constraint "commission_schedules_shop_id_foreign"
        foreign key ("shop_id") references "shops" ("id")
        on update cascade on delete restrict;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "commission_schedules"
        drop constraint "commission_schedules_shop_id_foreign";
    `);

    this.addSql('drop table if exists "commission_schedules" cascade;');

    this.addSql(`
      alter table "ledger_accounts"
        drop constraint if exists "ledger_accounts_kind_check";
    `);
    this.addSql(`
      alter table "ledger_accounts"
        add constraint "ledger_accounts_kind_check"
        check ("kind" in ('platform_clearing', 'seller_payable'));
    `);
  }
}
