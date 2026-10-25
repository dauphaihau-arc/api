import { Migration } from '@mikro-orm/migrations';

/**
 * The currency a Payout actually transfers in, frozen at claim time.
 *
 * The platform's provider balance settles in one currency, so a shop that
 * settles in another is converted before the transfer. `amount_minor`/`currency`
 * stay the shop-currency amounts the ledger discharges; `transfer_currency` and
 * `transfer_amount_minor` are what the provider is asked to move, and the claim
 * records them so a retry reuses exactly the numbers it claimed.
 *
 * Both columns are nullable because rows claimed before this slice record no
 * transfer currency; those rows settle with the shop-currency amount as before.
 */
export class Migration20261025100000_add_payout_transfer_fields extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "payouts"
        add column "transfer_currency" varchar(3) null,
        add column "transfer_amount_minor" bigint null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "payouts"
        drop column "transfer_amount_minor",
        drop column "transfer_currency";
    `);
  }
}
