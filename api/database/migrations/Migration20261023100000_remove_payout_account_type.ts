import { Migration } from '@mikro-orm/migrations';

export class Migration20261023100000_remove_payout_account_type extends Migration {
  override async up(): Promise<void> {
    // A Payout Account is always a bank account now. A destination kind must not
    // be silently discarded, so refuse to drop the column while any row still
    // claims to be something else: an operator resolves or exports those rows
    // first, then re-runs the migration.
    this.addSql(`
      do $$
      declare
        non_bank_accounts int;
      begin
        select count(*) into non_bank_accounts
        from "payout_accounts"
        where "type" is distinct from 'bank';

        if non_bank_accounts > 0 then
          raise exception
            'payout_accounts has % row(s) whose type is not ''bank''; export or resolve them before applying the bank-only payout account migration',
            non_bank_accounts;
        end if;
      end $$;
    `);

    this.addSql(`
      alter table "payout_accounts"
        drop column "type";
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "payout_accounts"
        add column "type" varchar(16) not null default 'bank';
    `);
  }
}
