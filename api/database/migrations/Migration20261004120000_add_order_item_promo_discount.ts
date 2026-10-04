import { Migration } from '@mikro-orm/migrations';

/**
 * Per-line product Promo Code savings allocated at commit and retained as
 * immutable evidence. Across a shop's eligible lines these allocations sum
 * exactly to the shop's `discount_minor`, while `sale_discount_minor` records
 * the separate Sale reduction already reflected in the merchandise price.
 */
export class Migration20261004120000_add_order_item_promo_discount extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      'alter table "order_items" add column "promo_discount_minor" int not null default 0;',
    );
  }

  override async down(): Promise<void> {
    this.addSql('alter table "order_items" drop column if exists "promo_discount_minor";');
  }
}
