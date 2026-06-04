import { Migration } from '@mikro-orm/migrations';

export class Migration20260603100500 extends Migration {
  override async up(): Promise<void> {
    // No-op: these columns/index/constraint were already introduced by
    // Migration20260603094000. This migration remains only to preserve
    // ordering/history for environments where it was generated.
  }

  override async down(): Promise<void> {
    // No-op for the same reason as up().
  }
}
