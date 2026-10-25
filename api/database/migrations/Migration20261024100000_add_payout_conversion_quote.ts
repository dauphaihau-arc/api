import { Migration } from '@mikro-orm/migrations';

export class Migration20261024100000_add_payout_conversion_quote extends Migration {
  override async up(): Promise<void> {
    // The conversion quote is frozen on the Payout at claim time: the shop
    // currency that leaves the balance, the account currency that arrives, the
    // rate used, the disclosed fee, and the target amount the provider is
    // expected to transfer. A retry reuses them and never re-quotes. Null on
    // Payouts claimed before cross-currency payout accounts existed; the fee is
    // a plain zero for those same rows.
    this.addSql(`
      alter table "payouts"
        add column "source_currency" varchar(3) null,
        add column "target_currency" varchar(3) null,
        add column "fx_rate" text null,
        add column "target_amount_minor" bigint null,
        add column "fx_fee_minor" bigint not null default 0;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "payouts"
        drop column "fx_fee_minor",
        drop column "target_amount_minor",
        drop column "fx_rate",
        drop column "target_currency",
        drop column "source_currency";
    `);
  }
}
