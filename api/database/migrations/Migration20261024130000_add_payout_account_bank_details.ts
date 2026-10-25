import { Migration } from '@mikro-orm/migrations';

/**
 * Adds the display-only bank metadata a seller sees on the payout card: the
 * bank's name and the last four digits of the account. Stripe reports both as
 * part of the connected account's external account; the full account number
 * and routing number are never stored.
 */
export class Migration20261024130000_add_payout_account_bank_details extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "payout_accounts"
        add column "bank_name" varchar(255) null,
        add column "last4" varchar(4) null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "payout_accounts"
        drop column "bank_name",
        drop column "last4";
    `);
  }
}
