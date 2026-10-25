import { Migration } from '@mikro-orm/migrations';

/**
 * Adds the provider's conversion evidence to a Payout.
 *
 * Phase 3 stops converting locally: the claim names the source and target
 * currencies and leaves `fx_rate` and `target_amount_minor` empty, then the
 * provider's transfer reports the rate it applied. `provider_fx_rate` stores
 * that rate verbatim as text and `target_amount_minor` is overwritten with the
 * destination amount derived from it, so the settled Payout records what
 * actually arrived rather than an estimate. A same-currency transfer, or the
 * local `manual_bank` adapter, reports none and keeps both null.
 */
export class Migration20261024140000_add_payout_provider_fx_rate extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "payouts"
        add column "provider_fx_rate" text null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "payouts"
        drop column "provider_fx_rate";
    `);
  }
}
