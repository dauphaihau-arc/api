import { Migration } from '@mikro-orm/migrations';

/**
 * Orders snapshot the Storefront Language the buyer explicitly chose at
 * checkout. Existing Orders fall back to English rather than inferring a
 * language from Market or currency. New Orders always write the snapshot, so
 * the default exists only to cover rows created without it.
 */
export class Migration20261120120000_add_order_language_snapshot extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "orders"
        add column "language" varchar(10) null;
    `);

    this.addSql(`
      update "orders"
      set "language" = 'en'
      where "language" is null;
    `);

    this.addSql(`
      alter table "orders"
        alter column "language" set default 'en',
        alter column "language" set not null;
    `);

    this.addSql(`
      alter table "orders"
        add constraint "orders_language_check"
        check ("language" in ('en', 'vi'));
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "orders"
        drop constraint if exists "orders_language_check";
    `);
    this.addSql('alter table "orders" drop column "language";');
  }
}
