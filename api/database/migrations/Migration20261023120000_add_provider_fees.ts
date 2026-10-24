import { Migration } from '@mikro-orm/migrations';

/**
 * Provider Fees are the fees the payment provider charges the platform. The fee
 * is a platform expense: its Journal Entry debits Platform Fee and credits
 * Platform Clearing, so it needs the `platform_fee` account kind and an entry
 * that names no shop.
 */
export class Migration20261023120000_add_provider_fees extends Migration {
  override async up(): Promise<void> {
    // Platform Fee is a platform expense account, never a Seller Payable source.
    this.addSql(`
      alter table "ledger_accounts"
        drop constraint if exists "ledger_accounts_kind_check";
    `);
    this.addSql(`
      alter table "ledger_accounts"
        add constraint "ledger_accounts_kind_check"
        check ("kind" in (
          'platform_clearing', 'platform_commission', 'platform_fee',
          'seller_payable'
        ));
    `);

    // A Provider Fee is platform-level: the Journal Entry it writes has no shop.
    this.addSql(`
      alter table "journal_entries"
        alter column "shop_id" drop not null;
    `);

    this.addSql(`
      create table "provider_fees" (
        "id" uuid not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "provider" varchar(32) not null,
        "provider_reference" varchar(255) not null,
        "currency" varchar(3) not null,
        "amount_minor" int not null,
        "occurred_at" timestamptz not null,
        "journal_entry_id" uuid not null,
        "recorded_at" timestamptz not null,
        constraint "provider_fees_pkey" primary key ("id")
      );
    `);
    // A provider charge is recorded once, however often the provider reports it.
    this.addSql(`
      alter table "provider_fees"
        add constraint "provider_fees_provider_provider_reference_unique"
        unique ("provider", "provider_reference");
    `);
    this.addSql(`
      alter table "provider_fees"
        add constraint "provider_fees_journal_entry_id_unique"
        unique ("journal_entry_id");
    `);
    // A fee is signed: positive is a charge, negative reverses one. Zero records
    // no money movement and stays refused.
    this.addSql(`
      alter table "provider_fees"
        add constraint "provider_fees_amount_minor_non_zero"
        check ("amount_minor" <> 0);
    `);
    this.addSql(`
      create index "provider_fees_occurred_at_index"
        on "provider_fees" ("occurred_at");
    `);
    this.addSql(`
      alter table "provider_fees"
        add constraint "provider_fees_journal_entry_id_foreign"
        foreign key ("journal_entry_id") references "journal_entries" ("id")
        on update cascade on delete restrict;
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "provider_fees" cascade;');

    // A platform-level entry has no shop, so the column can only be restored
    // when every entry still names one. A partial reversal is worse than none.
    this.addSql(`
      do $$
      begin
        if not exists (
          select 1 from "journal_entries" where "shop_id" is null
        ) then
          alter table "journal_entries"
            alter column "shop_id" set not null;
        else
          raise notice 'journal_entries keeps shop_id nullable: platform-level entries exist';
        end if;
      end
      $$;
    `);

    this.addSql(`
      alter table "ledger_accounts"
        drop constraint if exists "ledger_accounts_kind_check";
    `);
    this.addSql(`
      alter table "ledger_accounts"
        add constraint "ledger_accounts_kind_check"
        check ("kind" in ('platform_clearing', 'platform_commission', 'seller_payable'));
    `);
  }
}
