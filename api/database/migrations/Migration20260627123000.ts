import { Migration } from '@mikro-orm/migrations';

export class Migration20260627123000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      'alter table "checkout_quotes" add column "quote_fingerprint" varchar(64) null;',
    );
    this.addSql(
      'create index "checkout_quotes_cart_id_quote_fingerprint_index" on "checkout_quotes" ("cart_id", "quote_fingerprint");',
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      'drop index if exists "checkout_quotes_cart_id_quote_fingerprint_index";',
    );
    this.addSql(
      'alter table "checkout_quotes" drop column "quote_fingerprint";',
    );
  }
}
