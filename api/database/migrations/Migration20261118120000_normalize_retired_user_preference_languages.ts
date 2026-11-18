import { Migration } from '@mikro-orm/migrations';

/**
 * User Preference languages are now the Storefront Languages (`en`, `vi`);
 * `la` and `fr` were temporary compatibility values. Existing rows fall back
 * to the default language so a stored preference never names a value the
 * contract no longer publishes.
 */
export class Migration20261118120000_normalize_retired_user_preference_languages extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      update "user_preferences"
      set "language" = 'en'
      where "language" in ('la', 'fr');
    `);
  }

  override async down(): Promise<void> {
    // The original `la`/`fr` value is indistinguishable from a deliberate
    // `en` after the update, so restoring it would only reintroduce a retired
    // language into the contract.
  }
}
