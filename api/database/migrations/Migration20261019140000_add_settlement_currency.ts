import { Migration } from '@mikro-orm/migrations';

export class Migration20261019140000_add_settlement_currency extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "journal_entries"
        add column "charge_currency" varchar(3) null,
        add column "charge_amount_minor" int null,
        add column "fx_rate" text null,
        add column "fx_rate_source" varchar(100) null,
        add column "fx_rate_effective_at" timestamptz null,
        add column "fx_rate_source_timestamp" timestamptz null;
    `);

    this.addSql(`
      create table "settlement_currency_history" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "shop_id" uuid not null,
        "currency" varchar(3) not null,
        "effective_from" timestamptz not null,
        "effective_to" timestamptz null,
        constraint "settlement_currency_history_pkey" primary key ("id")
      );
    `);
    this.addSql(`
      alter table "settlement_currency_history"
        add constraint "settlement_currency_history_shop_id_effective_from_unique"
        unique ("shop_id", "effective_from");
    `);
    this.addSql(`
      create index "settlement_currency_history_shop_id_index"
        on "settlement_currency_history" ("shop_id");
    `);
    this.addSql(`
      alter table "settlement_currency_history"
        add constraint "settlement_currency_history_shop_id_foreign"
        foreign key ("shop_id") references "shops" ("id")
        on update cascade on delete restrict;
    `);

    // Every shop opens its history with the currency it prices in today.
    this.addSql(`
      insert into "settlement_currency_history"
        ("id", "created_at", "updated_at", "shop_id", "currency", "effective_from", "effective_to")
      select gen_random_uuid(), now(), now(), s."id", s."currency", s."created_at", null
      from "shops" s;
    `);

    // One position per shop replaces one per shop and currency — but only where
    // that is truthful. A shop whose recorded balance is not already in the
    // currency it settles in cannot be collapsed or relabelled without
    // converting money that was already recorded, and recorded money is never
    // re-denominated. Refuse loudly and leave the operator to reconcile those
    // balances first. Never merge, never relabel, never pick a winner.
    this.addSql(`
      do $$
      declare
        unconvertible_shops int;
      begin
        select count(*) into unconvertible_shops
        from "seller_payable_positions" p
        join "shops" s on s."id" = p."shop_id"
        where p."currency" <> s."currency"
           or p."shop_id" in (
             select "shop_id"
             from "seller_payable_positions"
             group by "shop_id"
             having count(*) > 1
           );

        if unconvertible_shops > 0 then
          raise exception
            'seller_payable_positions holds balances that are not in the shop currency for % shop(s); reconcile them (pay them out or adjust them) before applying the settlement currency migration',
            unconvertible_shops;
        end if;
      end $$;
    `);

    this.addSql(`
      alter table "seller_payable_positions"
        drop constraint "seller_payable_positions_shop_id_currency_unique";
    `);
    this.addSql(`
      alter table "seller_payable_positions"
        add constraint "seller_payable_positions_shop_id_unique"
        unique ("shop_id");
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "seller_payable_positions"
        drop constraint "seller_payable_positions_shop_id_unique";
    `);
    this.addSql(`
      alter table "seller_payable_positions"
        add constraint "seller_payable_positions_shop_id_currency_unique"
        unique ("shop_id", "currency");
    `);

    this.addSql('drop table if exists "settlement_currency_history" cascade;');

    this.addSql(`
      alter table "journal_entries"
        drop column if exists "fx_rate_source_timestamp",
        drop column if exists "fx_rate_effective_at",
        drop column if exists "fx_rate_source",
        drop column if exists "fx_rate",
        drop column if exists "charge_amount_minor",
        drop column if exists "charge_currency";
    `);
  }
}
