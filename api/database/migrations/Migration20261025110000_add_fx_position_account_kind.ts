import { Migration } from '@mikro-orm/migrations';

/**
 * A cross-currency Payout leaves the platform's provider balance in the
 * transfer currency, which is not the currency the shop-currency entry
 * discharges. That movement needs its own platform-level account, so
 * `fx_position` becomes a Ledger Account kind: the counterpart of Platform
 * Clearing in the platform currency.
 */
export class Migration20261025110000_add_fx_position_account_kind extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "ledger_accounts"
        drop constraint if exists "ledger_accounts_kind_check";
    `);
    this.addSql(`
      alter table "ledger_accounts"
        add constraint "ledger_accounts_kind_check"
        check ("kind" in (
          'platform_clearing', 'platform_commission', 'platform_fee',
          'fx_position', 'seller_payable'
        ));
    `);
  }

  override async down(): Promise<void> {
    // The kind can only be retired when no account still uses it; a partial
    // reversal of the constraint would lose the rows' meaning.
    this.addSql(`
      do $$
      begin
        if not exists (
          select 1 from "ledger_accounts" where "kind" = 'fx_position'
        ) then
          alter table "ledger_accounts"
            drop constraint if exists "ledger_accounts_kind_check";
          alter table "ledger_accounts"
            add constraint "ledger_accounts_kind_check"
            check ("kind" in (
              'platform_clearing', 'platform_commission', 'platform_fee',
              'seller_payable'
            ));
        else
          raise notice 'ledger_accounts keeps fx_position: accounts still use it';
        end if;
      end
      $$;
    `);
  }
}
