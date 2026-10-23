import { Migration } from '@mikro-orm/migrations';

export class Migration20261022120000_add_payout_claimed_allocations extends Migration {
  override async up(): Promise<void> {
    // A provider failure is retried against the exact amount and Orders the
    // Payout claimed, not recomputed from availability a refund may have
    // changed in between. Older rows keep null: nothing schedules a retry for
    // them.
    this.addSql(`
      alter table "payouts"
        add column "claimed_allocations" jsonb null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "payouts"
        drop column "claimed_allocations";
    `);
  }
}
